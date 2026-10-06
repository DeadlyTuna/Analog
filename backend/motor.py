"""Motor + analog front-end simulator, and the feature extractor the AI uses.

The simulated chain is the real build, stage for stage:
    DC motor current -> 0.1 ohm shunt -> LM358 diff amp (x20)
    -> unity-gain Sallen-Key low-pass -> Arduino Uno 10-bit ADC @ 1 kHz

When the hardware arrives only the ADC counts come from serial instead of
MotorSim.step(); extract() and the model stay exactly the same.
"""
import numpy as np
from scipy import signal

# ---- circuit: set these to the parts you actually solder (calibration knobs) ----
R_SHUNT = 0.1                                # ohm
GAIN = 200e3 / 10e3                          # diff amp Rf / Rin
LPF_R, LPF_C1, LPF_C2 = 10e3, 100e-9, 47e-9  # Sallen-Key, equal R, C1 = feedback cap
V_SAT = 3.5                                  # LM358 max output on a 5 V rail
VREF, ADC_MAX = 5.0, 1023                    # Uno 10-bit ADC
FS = 1000                                    # ADC sample rate, Hz
OVERSAMPLE = 10                              # the "analog" world runs at FS * OVERSAMPLE

LPF_FC = 1 / (2 * np.pi * LPF_R * np.sqrt(LPF_C1 * LPF_C2))
LPF_Q = 0.5 * np.sqrt(LPF_C1 / LPF_C2)

# ---- motor: 12 V geared, ~200 RPM output, 30:1 gearbox ----
I_NOLOAD = 0.30       # A, free running with pulley + belt
K_LOAD = 0.65         # A per unit load torque
RPS_OUT = 200 / 60    # output shaft rev/s at no load
GEAR, SLOTS = 30, 6   # commutator ripple ~600 Hz: the low-pass filter's job to remove it

CLASSES = ["normal", "overload", "friction"]
FEATURES = ["mean", "rms", "std", "peak", "p2p", "crest", "kurtosis",
            "dom_freq", "dom_amp", "band_0_5", "band_5_50"]
SPEC_MAX_HZ = 40

_FS_SIM = FS * OVERSAMPLE


def adc_to_amps(counts):
    return np.asarray(counts, float) * VREF / ADC_MAX / GAIN / R_SHUNT


def _unit_noise_filter(b, a):
    """Scale b so filtered unit white noise comes out with unit std."""
    x = signal.lfilter(b, a, np.random.default_rng(0).standard_normal(_FS_SIM * 5))
    return b / x[_FS_SIM:].std(), a


_LPF = signal.bilinear([1], [LPF_R**2 * LPF_C1 * LPF_C2, 2 * LPF_R * LPF_C2, 1], _FS_SIM)
_WOBBLE = _unit_noise_filter(*signal.butter(1, 1.5, fs=_FS_SIM))           # belt / load torque wander
_CHATTER = _unit_noise_filter(*signal.butter(2, [5, 40], "bandpass", fs=_FS_SIM))  # stick-slip


class _Filter:
    """IIR filter that keeps its state across chunks, like a real circuit."""

    def __init__(self, b, a):
        self.b, self.a = b, a
        self.zi = np.zeros(max(len(a), len(b)) - 1)

    def __call__(self, x):
        y, self.zi = signal.lfilter(self.b, self.a, x, zi=self.zi)
        return y


def _target(condition, severity):
    """(load torque, rub intensity) the motor settles to."""
    s = float(np.clip(severity, 0, 1))
    if condition == "overload":
        return 0.25 + 0.75 * s, 0.0
    if condition == "friction":
        return 0.10 + 0.25 * s, 0.3 + 0.7 * s
    return 0.05, 0.0


class MotorSim:
    def __init__(self, rng=None, vary=False):
        self.rng = rng or np.random.default_rng()
        # unit-to-unit spread (training only): no two motors or supplies are identical
        j = self.rng.uniform if vary else (lambda lo, hi: (lo + hi) / 2)
        self.i0 = I_NOLOAD * j(0.85, 1.15)
        self.rps0 = RPS_OUT * j(0.9, 1.1)
        self.noise = 0.02 * j(0.6, 1.5)  # V rms at the amp output
        self.lpf, self.wobble, self.chatter = _Filter(*_LPF), _Filter(*_WOBBLE), _Filter(*_CHATTER)
        self.condition, self.severity = "normal", 0.6
        self.load, self.rub = _target("normal", 0)
        self.phase = self.rng.uniform(0, 2 * np.pi)
        self.rpm = self.rps0 * 60
        self.n = 0  # ADC samples produced so far

    def set(self, condition, severity=None):
        if condition not in CLASSES:
            raise ValueError(condition)
        self.condition = condition
        if severity is not None:
            self.severity = float(np.clip(float(severity), 0, 1))

    def settle(self):
        self.load, self.rub = _target(self.condition, self.severity)

    def step(self, n):
        """Advance n ADC samples. Returns every stage of the chain at the ADC rate."""
        m, r = n * OVERSAMPLE, self.rng
        tl, tr = _target(self.condition, self.severity)
        k = 1 - np.exp(-n / FS / 0.4)  # 0.4 s mechanical time constant
        load = np.linspace(self.load, self.load + (tl - self.load) * k, m)
        rub = np.linspace(self.rub, self.rub + (tr - self.rub) * k, m)
        self.load, self.rub = load[-1], rub[-1]

        rps = self.rps0 * (1 - 0.45 * load)
        phase = self.phase + np.cumsum(2 * np.pi * rps / _FS_SIM)
        self.phase, self.rpm = phase[-1] % (2 * np.pi), rps[-1] * 60

        i = (self.i0 + K_LOAD * load) * (1 + 0.04 * np.sin(phase))     # pulley eccentricity
        i += 0.03 * load * self.wobble(r.standard_normal(m))            # load torque wander
        i += rub * 0.35 * np.maximum(0, np.cos(phase)) ** 12 * (1 + 0.3 * r.standard_normal())  # rub once per rev
        i += rub * 0.05 * self.chatter(r.standard_normal(m))            # stick-slip chatter
        i *= 1 + 0.05 * np.sin(phase * GEAR * SLOTS)                    # commutator ripple

        v_shunt = i * R_SHUNT
        spikes = (r.random(m) < 0.002) * r.normal(0, 0.15, m)          # brush arcing
        v_amp = np.clip(GAIN * v_shunt + self.noise * r.standard_normal(m) + spikes, 0, V_SAT)
        v_filt = self.lpf(v_amp)

        d = slice(OVERSAMPLE - 1, None, OVERSAMPLE)  # the ADC samples every 10th point
        adc = np.clip(np.round(v_filt[d] / VREF * ADC_MAX), 0, ADC_MAX).astype(int)
        self.n += n
        return dict(i=i[d], v_shunt=v_shunt[d], v_amp=v_amp[d], v_filt=v_filt[d], adc=adc)


def extract(i):
    """Features of one window of current (A). Returns (feature vector, spectrum amplitude in A)."""
    x = i - i.mean()
    std = x.std() + 1e-9
    rms = np.sqrt(np.mean(i**2))
    n_fft = 4 * len(x)  # zero-pad for a finer frequency grid
    mag = np.abs(np.fft.rfft(x * np.hanning(len(x)), n_fft)) * 4 / len(x)
    f = np.fft.rfftfreq(n_fft, 1 / FS)
    p = mag**2
    total = p[f > 0.5].sum() + 1e-12
    band = lambda lo, hi: p[(f >= lo) & (f < hi)].sum() / total
    search = np.flatnonzero((f > 0.75) & (f <= 100))
    k = search[np.argmax(mag[search])]
    vec = [i.mean(), rms, std, i.max(), np.ptp(i), i.max() / rms, np.mean(x**4) / std**4,
           f[k], mag[k], band(0.5, 5), band(5, 50)]
    return np.array(vec), mag[f <= SPEC_MAX_HZ]


if __name__ == "__main__":
    sim = MotorSim(np.random.default_rng(1))
    sim.step(FS)
    out = sim.step(FS)
    normal = adc_to_amps(out["adc"]).mean()
    assert abs(normal - out["i"].mean()) < 0.01, normal  # chain round-trips the current within 10 mA
    assert 225 < LPF_FC < 240, LPF_FC
    sim.set("overload", 1)
    sim.step(3 * FS)
    assert adc_to_amps(sim.step(FS)["adc"]).mean() > normal + 0.3
    assert len(extract(out["i"])[0]) == len(FEATURES)
    print(f"ok  fc={LPF_FC:.0f} Hz  Q={LPF_Q:.2f}  normal={normal:.3f} A")
