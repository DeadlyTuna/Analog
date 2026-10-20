"""Measured numbers for the paper. Run: python experiments.py   (about 10 min; writes results.json)"""
import json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BACKEND, RESULTS
from contextlib import contextmanager
import joblib, numpy as np
from scipy import signal
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier

sys.path.insert(0, str(BACKEND))
import motor
from motor import CLASSES, FEATURES, FS, MotorSim, adc_to_amps, extract

R = {}
bundle = joblib.load(BACKEND / "model.joblib")
rf = bundle["model"]
R["bundle"] = {k: bundle[k] for k in ("accuracy", "confusion", "importance", "n_train", "n_test")}
R["features"] = FEATURES


@contextmanager
def patched(**kw):
    old = {k: getattr(motor, k) for k in kw}
    for k, v in kw.items():
        setattr(motor, k, v)
    try:
        yield
    finally:
        for k, v in old.items():
            setattr(motor, k, v)


def window(rng, cond, sev, noise=1.0, i0=None, kload=None, bypass=False):
    kw = {} if kload is None else {"K_LOAD": kload}
    with patched(**kw):
        sim = MotorSim(rng, vary=True)
        if i0 is not None:
            sim.i0 = i0
        sim.noise *= noise
        if bypass:
            sim.lpf = lambda x: x
        sim.set(cond, sev)
        sim.settle()
        sim.step(FS // 2)
        return extract(adc_to_amps(sim.step(FS)["adc"]))[0]


def dataset(seed, n, noise=1.0, shift=False, bypass=False, sev=(0.25, 1.0)):
    rng = np.random.default_rng(seed)
    X, y = [], []
    for c, name in enumerate(CLASSES):
        for _ in range(n):
            i0 = motor.I_NOLOAD * rng.uniform(0.6, 1.4) if shift else None
            kl = motor.K_LOAD * rng.uniform(0.75, 1.25) if shift else None
            X.append(window(rng, name, rng.uniform(*sev), noise, i0, kl, bypass))
            y.append(c)
    return np.array(X), np.array(y)


# ---- training set identical to train.py (seed 0, 400/class, severity 0.25-1) ----
t0 = time.time()
rng = np.random.default_rng(0)
Xtr_all = np.array([window(rng, c, rng.uniform(0.25, 1)) for c in CLASSES for _ in range(400)])
y_all = np.repeat(np.arange(3), 400)
Xtr, Xte, ytr, yte = train_test_split(Xtr_all, y_all, test_size=0.25, stratify=y_all, random_state=0)
print("train set built", round(time.time() - t0, 1), "s")

models = {
    "Random Forest (100 trees)": rf,
    "Decision tree": DecisionTreeClassifier(random_state=0).fit(Xtr, ytr),
    "SVM (RBF)": make_pipeline(StandardScaler(), SVC(random_state=0)).fit(Xtr, ytr),
    "k-NN (k = 5)": make_pipeline(StandardScaler(), KNeighborsClassifier(5)).fit(Xtr, ytr),
    "Logistic regression": make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)).fit(Xtr, ytr),
}
sets = {
    "nominal (held-out)": (Xte, yte),
    "noise x8": dataset(101, 100, noise=8),
    "unit shift": dataset(102, 100, shift=True),
    "shift + noise x4": dataset(103, 100, shift=True, noise=4),
}
R["comparison"] = {m: {s: float((mod.predict(X) == y).mean()) for s, (X, y) in sets.items()} for m, mod in models.items()}
print(json.dumps(R["comparison"], indent=1))

# ---- independent fresh test (new seeds, nominal) + per-class + confusion ----
Xf, yf = dataset(7, 150)
pf = rf.predict(Xf)
R["fresh"] = {"acc": float((pf == yf).mean()), "n": int(len(yf))}

# ---- severity sweep (RF), including below the training range ----
sweep = {}
for lo, hi in [(0.0, 0.1), (0.1, 0.2), (0.2, 0.3), (0.3, 0.5), (0.5, 0.75), (0.75, 1.0)]:
    X, y = dataset(int(lo * 100) + 200, 60, sev=(lo, hi))
    p = rf.predict(X)
    sweep[f"{lo:.2f}-{hi:.2f}"] = {c: float((p[y == i] == i).mean()) for i, c in enumerate(CLASSES)}
R["severity_sweep"] = sweep

# ---- noise sweep (RF only) ----
R["noise_sweep"] = {}
for m in (1, 2, 4, 8, 16):
    X, y = dataset(300 + m, 80, noise=m)
    R["noise_sweep"][str(m)] = float((rf.predict(X) == y).mean())

# ---- filter ablation: with vs without the Sallen-Key stage ----
def err_rmse(bypass, seed=5, seconds=20):
    rng = np.random.default_rng(seed)
    sim = MotorSim(rng)
    if bypass:
        sim.lpf = lambda x: x
    sim.step(FS)
    out = sim.step(seconds * FS)
    meas = adc_to_amps(out["adc"])
    b, a = signal.butter(4, 60, fs=FS)           # the part of the current the features care about
    ref = signal.filtfilt(b, a, out["i"])
    meas_lp = signal.filtfilt(b, a, meas)
    hf = meas - meas_lp                          # what is left above 60 Hz after sampling
    return float(np.sqrt(np.mean((meas - ref) ** 2)) * 1e3), float(hf.std() * 1e3)
R["filter"] = {}
for name, byp in (("with filter", False), ("without filter", True)):
    rm, hf = err_rmse(byp)
    R["filter"][name] = {"rmse_mA": rm, "hf_std_mA": hf}
Xb, yb = dataset(77, 100, bypass=True)
R["filter"]["without filter"]["acc_model_trained_with_filter"] = float((rf.predict(Xb) == yb).mean())
R["filter"]["with filter"]["acc_model_trained_with_filter"] = R["fresh"]["acc"]

# ---- analytic filter numbers ----
Rr, C1, C2 = motor.LPF_R, motor.LPF_C1, motor.LPF_C2
def H(f):
    s = 2j * np.pi * f
    return 1 / (s * s * Rr * Rr * C1 * C2 + s * 2 * Rr * C2 + 1)
fs_ = np.logspace(0, 4, 200000)
mag = 20 * np.log10(np.abs(H(fs_)))
f3 = float(fs_[np.argmax(mag < -3)])
R["bode"] = {"f0": float(motor.LPF_FC), "Q": float(motor.LPF_Q), "f_3dB": f3,
             "dB@500": float(20 * np.log10(abs(H(500)))), "dB@600": float(20 * np.log10(abs(H(600)))),
             "dB@400": float(20 * np.log10(abs(H(400)))), "dB@50": float(20 * np.log10(abs(H(50)))),
             "dB@3.3": float(20 * np.log10(abs(H(3.3))))}

# ---- streaming: latency, false alarms, timing ----
EMA, SWITCH, HOP = 0.25, 0.6, motor.FS // 20
class Stream:
    def __init__(self, seed, cond="normal", sev=0.6, vary=True):
        self.sim = MotorSim(np.random.default_rng(seed), vary=vary)
        self.sim.set(cond, sev); self.sim.settle()
        self.win = adc_to_amps(self.sim.step(FS)["adc"]); self.ema = None; self.label = None; self.t = 0.0
        self.probs = []
    def hop(self):
        s = self.sim.step(HOP)
        self.win = np.concatenate([self.win[HOP:], adc_to_amps(s["adc"])])
        feat = extract(self.win)[0]
        p = rf.predict_proba(feat[None])[0]
        self.ema = p if self.ema is None else (1 - EMA) * self.ema + EMA * p
        if self.label is None or self.ema.max() >= SWITCH:
            self.label = int(self.ema.argmax())
        self.t += HOP / FS
        self.probs.append(self.ema.copy())
        return self.label

lat = {}
for cond, sev in (("overload", 0.7), ("friction", 0.6), ("overload", 0.3), ("friction", 0.3)):
    ts, tstab = [], []
    for seed in range(30):
        st = Stream(1000 + seed)
        for _ in range(60): st.hop()                 # 3 s of healthy running
        assert st.label == 0, (seed, st.label)
        st.sim.set(cond, sev); t0 = st.t; first = None; run = 0; stable = None
        target = CLASSES.index(cond)
        for _ in range(200):                          # up to 10 s
            lab = st.hop()
            if lab == target:
                first = first if first is not None else st.t - t0
                run += 1
                if run >= 10 and stable is None: stable = first
            else:
                run = 0; first = None if stable is None else first
        ts.append(first); tstab.append(stable)
    ts = [x for x in ts if x is not None]
    lat[f"{cond} {sev}"] = {"mean_s": float(np.mean(ts)), "std_s": float(np.std(ts)), "min_s": float(min(ts)),
                            "max_s": float(max(ts)), "detected": len(ts), "trials": 30}
R["latency"] = lat

flips = 0; hops = 0
for seed in range(12):
    st = Stream(2000 + seed)
    for _ in range(40): st.hop()
    base = st.label
    for _ in range(1200):                             # 60 s
        flips += int(st.hop() != base); hops += 1
R["false_alarm"] = {"hops": hops, "wrong_label_hops": flips, "minutes": hops * HOP / FS / 60}

feat_t, pred_t = [], []
win = adc_to_amps(MotorSim(np.random.default_rng(1)).step(FS)["adc"])
for _ in range(300):
    t = time.perf_counter(); f = extract(win)[0]; feat_t.append(time.perf_counter() - t)
    t = time.perf_counter(); rf.predict_proba(f[None]); pred_t.append(time.perf_counter() - t)
R["timing_ms"] = {"features": float(np.median(feat_t) * 1e3), "forest": float(np.median(pred_t) * 1e3), "hop_ms": 50}

# ---- circuit-derived numbers ----
R["circuit"] = {"lsb_mV": 5 / 1023 * 1e3, "lsb_mA": 5 / 1023 / motor.GAIN / motor.R_SHUNT * 1e3,
                "i_max_A": motor.V_SAT / motor.GAIN / motor.R_SHUNT, "fs": FS}
# operating points: ADC counts / mean current for each condition
ops = {}
for cond, sev in (("normal", 0.6), ("overload", 0.7), ("friction", 0.6)):
    sim = MotorSim(np.random.default_rng(9)); sim.set(cond, sev); sim.settle(); sim.step(FS // 2)
    o = sim.step(2 * FS)
    ops[cond] = {"I_mean": float(o["i"].mean()), "counts": float(o["adc"].mean()), "rpm": float(sim.rpm)}
R["operating"] = ops

json.dump(R, open(RESULTS, "w"), indent=1)
print(json.dumps({k: R[k] for k in ("fresh", "severity_sweep", "noise_sweep", "filter", "bode", "latency", "false_alarm", "timing_ms", "circuit", "operating")}, indent=1))
