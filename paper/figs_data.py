"""Data-driven figures (vector PDF, Times New Roman, 1 column wide). Run: python figs_data.py"""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BACKEND, FIGS, FONT_DIR, RESULTS, ensure_fonts
sys.path.insert(0, str(BACKEND))
ensure_fonts()
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
import joblib

import motor
from motor import FS, MotorSim, adc_to_amps, extract

for f in ("times", "timesbd", "timesi", "timesbi"):
    fm.fontManager.addfont(str(FONT_DIR / f"{f}.ttf"))
plt.rcParams.update({
    "font.family": "Times New Roman", "font.size": 7, "axes.labelsize": 7, "xtick.labelsize": 6.5, "ytick.labelsize": 6.5,
    "legend.fontsize": 6.5, "axes.linewidth": 0.5, "xtick.major.width": 0.5, "ytick.major.width": 0.5,
    "xtick.major.size": 2.5, "ytick.major.size": 2.5, "lines.linewidth": 0.8, "pdf.fonttype": 42,
    "mathtext.fontset": "stix", "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.linewidth": 0.3, "grid.color": "#d9d9d9", "figure.dpi": 100, "savefig.dpi": 220,
})
W = 3.41
COL = {"normal": "#1b7f3b", "overload": "#d98200", "friction": "#c0392b"}
LAB = {"normal": "Normal", "overload": "Overload", "friction": "Mechanical fault"}
R = json.load(open(RESULTS))
rf = joblib.load(BACKEND / "model.joblib")["model"]


def save(fig, name):
    FIGS.mkdir(exist_ok=True)
    fig.savefig(FIGS / f"{name}.pdf")
    plt.close(fig)


def run(cond, sev, seed=9, settle=0.5, seconds=3.0):
    sim = MotorSim(np.random.default_rng(seed))
    sim.set(cond, sev); sim.settle(); sim.step(int(settle * FS) + FS)
    return sim, sim.step(int(seconds * FS))


# ---------------- Fig. 4: Bode ----------------
def fig_bode():
    Rr, C1, C2 = motor.LPF_R, motor.LPF_C1, motor.LPF_C2
    f = np.logspace(0, 4, 2000); s = 2j * np.pi * f
    H = 1 / (s * s * Rr * Rr * C1 * C2 + s * 2 * Rr * C2 + 1); db = 20 * np.log10(abs(H))
    fig, ax = plt.subplots(figsize=(W, 1.8))
    ax.semilogx(f, db, color="#1f4e9c", lw=1.1)
    ax.axvspan(500, 1e4, color="#f0f0f0", zorder=0)
    ax.text(2300, -4.5, "above Nyquist", ha="center", fontsize=6, color="#555")
    b = R["bode"]
    for x, y, lab, tx, ty in ((b["f_3dB"], -3, f"$-$3 dB at {b['f_3dB']:.0f} Hz", 12, -6),
                              (500, b["dB@500"], f"Nyquist (500 Hz): {b['dB@500']:.1f} dB".replace("-", "−"), 6, -22),
                              (600, b["dB@600"], f"600 Hz commutator ripple: {b['dB@600']:.1f} dB".replace("-", "−"), 6, -32)):
        ax.plot([x], [y], "o", ms=3, color="#c0392b", zorder=5)
        ax.annotate(lab, (x, y), xytext=(tx, ty), textcoords="data", fontsize=6.2, va="center",
                    arrowprops=dict(arrowstyle="-", lw=0.4, color="#555", shrinkA=1, shrinkB=2))
    ax.axvline(b["f0"], color="#999", lw=0.5, ls="--")
    ax.text(b["f0"] * 0.93, -49, f"$f_0$ = {b['f0']:.0f} Hz", rotation=90, fontsize=6, ha="right", va="bottom", color="#555")
    ax.set_xlim(1, 1e4); ax.set_ylim(-50, 5)
    ax.set_xlabel("Frequency (Hz)"); ax.set_ylabel("Magnitude (dB)")
    fig.subplots_adjust(left=0.14, right=0.985, top=0.97, bottom=0.2)
    save(fig, "fig_bode")


# ---------------- Fig. 5: signal at each stage (friction) ----------------
def fig_stages():
    sim, o = run("friction", 0.6, seed=4, seconds=1.6)
    t = np.arange(len(o["i"])) / FS
    fig, ax = plt.subplots(3, 1, figsize=(W, 2.6), sharex=True)
    ax[0].plot(t, o["i"], color="#c0392b"); ax[0].set_ylabel("Motor current $I$ (A)")
    ax[1].plot(t, o["v_amp"], color="#9a9a9a", lw=0.5, label="amplifier output $V_a$")
    ax[1].plot(t, o["v_filt"], color="#1f4e9c", lw=1.0, label="filter output $V_f$")
    ax[1].set_ylabel("Voltage (V)"); ax[1].legend(loc="upper center", frameon=False, ncol=2, columnspacing=1.2, handlelength=1.6)
    ax[2].step(t, o["adc"], where="post", color="#333", lw=0.7); ax[2].set_ylabel("ADC count $N$")
    ax[2].set_xlabel("Time (s)")
    for a, tag in zip(ax, "abc"):
        a.text(0.01, 0.9, f"({tag})", transform=a.transAxes, fontsize=7, va="top", fontweight="bold")
    ax[0].set_ylim(0.2, 1.0); ax[1].set_ylim(0.3, 2.5); ax[2].set_ylim(o["adc"].min() - 15, o["adc"].max() + 15)
    fig.subplots_adjust(left=0.15, right=0.985, top=0.985, bottom=0.135, hspace=0.12)
    save(fig, "fig_stages")


# ---------------- Fig. 6 / 7: three conditions ----------------
def conditions():
    out = {}
    for cond, sev in (("normal", 0.6), ("overload", 0.7), ("friction", 0.6)):
        sim, o = run(cond, sev, seed=9, seconds=3.0)
        cur = adc_to_amps(o["adc"])
        out[cond] = dict(cur=cur, spec=extract(cur[-FS:])[1], rpm=sim.rpm, sev=sev)
    return out


def fig_conditions(c):
    fig, ax = plt.subplots(3, 1, figsize=(W, 2.3), sharex=True)
    t = np.arange(3 * FS) / FS
    for a, k in zip(ax, ("normal", "overload", "friction")):
        a.plot(t, c[k]["cur"], color=COL[k], lw=0.7)
        a.set_ylim(0, 1.25); a.set_yticks([0, 0.5, 1.0]); a.set_ylabel("$I$ (A)")
        a.text(0.99, 0.88, f"{LAB[k]}: mean {c[k]['cur'].mean():.2f} A, {c[k]['rpm']:.0f} RPM", transform=a.transAxes,
               ha="right", va="top", fontsize=6.5)
    ax[-1].set_xlabel("Time (s)")
    fig.subplots_adjust(left=0.13, right=0.985, top=0.985, bottom=0.14, hspace=0.12)
    save(fig, "fig_conditions")


def fig_spectra(c):
    fig, ax = plt.subplots(figsize=(W, 1.8))
    f = np.linspace(0, 40, len(c["normal"]["spec"]))
    for k, ls in (("normal", "-"), ("overload", "--"), ("friction", "-")):
        ax.plot(f, c[k]["spec"] * 1e3, color=COL[k], ls=ls, label=LAB[k], lw=0.9)
    ax.set_xlim(0, 40); ax.set_ylim(0, None)
    ax.set_xlabel("Frequency (Hz)"); ax.set_ylabel("Amplitude (mA)")
    ax.legend(frameon=False, loc="upper right")
    fig.subplots_adjust(left=0.13, right=0.985, top=0.97, bottom=0.2)
    save(fig, "fig_spectra")


# ---------------- Fig. 8: feature importance ----------------
def fig_importance():
    names = {"band_5_50": "Energy 5–50 Hz", "crest": "Crest factor", "p2p": "Peak-to-peak", "mean": "Mean current",
             "std": "Standard deviation", "peak": "Peak current", "rms": "RMS current", "band_0_5": "Energy 0.5–5 Hz",
             "kurtosis": "Kurtosis", "dom_amp": "Dominant amplitude", "dom_freq": "Dominant frequency"}
    imp = sorted(zip(R["features"], R["bundle"]["importance"]), key=lambda t: t[1])
    fig, ax = plt.subplots(figsize=(W, 1.95))
    ax.barh([names[k] for k, _ in imp], [v for _, v in imp], color="#1f4e9c", height=0.62)
    for y, (_, v) in enumerate(imp):
        ax.text(v + 0.002, y, f"{v:.3f}", va="center", fontsize=6.2)
    ax.set_xlim(0, 0.19); ax.set_xlabel("Gini importance"); ax.grid(axis="y", visible=False)
    fig.subplots_adjust(left=0.30, right=0.985, top=0.985, bottom=0.19)
    save(fig, "fig_importance")


# ---------------- Fig. 10: classifier response to injected faults ----------------
def fig_response():
    EMA, SWITCH, HOP = 0.25, 0.6, FS // 20
    sim = MotorSim(np.random.default_rng(21), vary=True)
    win = adc_to_amps(sim.step(FS)["adc"]); ema = None; label = None
    script = [(0, "normal", 0.6), (6, "overload", 0.7), (14, "normal", 0.6), (20, "friction", 0.6), (28, "normal", 0.6)]
    T, P, L = [], [], []
    for k in range(int(34 / 0.05)):
        t = k * 0.05
        for st, c, s in script:
            if abs(t - st) < 1e-6: sim.set(c, s)
        o = sim.step(HOP); win = np.concatenate([win[HOP:], adc_to_amps(o["adc"])])
        p = rf.predict_proba(extract(win)[0][None])[0]
        ema = p if ema is None else (1 - EMA) * ema + EMA * p
        if label is None or ema.max() >= SWITCH: label = int(ema.argmax())
        T.append(t); P.append(ema.copy()); L.append(label)
    T, P = np.array(T), np.array(P)
    fig, ax = plt.subplots(2, 1, figsize=(W, 2.3), sharex=True, gridspec_kw=dict(height_ratios=[1, 3.2], hspace=0.08))
    names = ["normal", "overload", "friction"]
    ends = [s for s, _, _ in script[1:]] + [34]
    for (st, c, _), en in zip(script, ends):
        ax[0].barh(1, en - st, left=st, height=0.7, color=COL[c], alpha=0.35, lw=0)
        ax[0].text((st + en) / 2, 1, LAB[c].replace("Mechanical fault", "Friction"), ha="center", va="center", fontsize=6)
    lab = np.array(L)
    for i, n in enumerate(names):
        idx = np.where(lab == i)[0]
        if len(idx): ax[0].plot(T[idx], np.zeros(len(idx)), "|", color=COL[n], ms=4, mew=1.0)
    ax[0].set_ylim(-0.5, 1.6); ax[0].set_yticks([0, 1], ["AI", "True"]); ax[0].grid(False)
    ax[0].spines["left"].set_visible(False); ax[0].spines["bottom"].set_visible(False); ax[0].tick_params(axis="y", length=0)
    for i, n in enumerate(names):
        ax[1].plot(T, P[:, i], color=COL[n], label=LAB[n], lw=1.0, ls="--" if n == "overload" else "-")
    ax[1].axhline(SWITCH, color="#777", lw=0.5, ls=":"); ax[1].text(33.8, SWITCH + 0.02, "0.6", ha="right", fontsize=6, color="#555")
    ax[1].set_ylim(-0.03, 1.05); ax[1].set_xlim(0, 34)
    ax[1].set_xlabel("Time (s)"); ax[1].set_ylabel("Probability")
    ax[1].legend(frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.34), ncol=3, fontsize=6.3, columnspacing=1.6, handlelength=2.0)
    fig.subplots_adjust(left=0.13, right=0.985, top=0.985, bottom=0.285)
    save(fig, "fig_response")


if __name__ == "__main__":
    fig_bode(); fig_stages()
    c = conditions(); fig_conditions(c); fig_spectra(c)
    fig_importance(); fig_response()
    print("ok")
