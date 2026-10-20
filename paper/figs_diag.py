"""Diagram figures: block diagram, flowchart, schematic. Run: python figs_diag.py"""
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
from matplotlib.patches import FancyBboxPatch, Circle, Polygon, Ellipse, FancyArrowPatch

for f in ("times", "timesbd", "timesi", "timesbi"):
    fm.fontManager.addfont(str(FONT_DIR / f"{f}.ttf"))
plt.rcParams.update({"font.family": "Times New Roman", "font.size": 6, "pdf.fonttype": 42, "mathtext.fontset": "stix",
                     "savefig.dpi": 220})
W = 3.41
INK = "#222"


def save(fig, name):
    FIGS.mkdir(exist_ok=True)
    fig.savefig(FIGS / f"{name}.pdf"); plt.close(fig)


def canvas(h, xlim=(0, 100), ylim=(0, 100)):
    fig = plt.figure(figsize=(W, h)); ax = fig.add_axes([0, 0, 1, 1]); ax.axis("off")
    ax.set_xlim(*xlim); ax.set_ylim(*ylim); return fig, ax


def arrow(ax, p0, p1, lw=0.7, color=INK):
    ax.add_patch(FancyArrowPatch(p0, p1, arrowstyle="-|>", mutation_scale=5.5, lw=lw, color=color, shrinkA=0, shrinkB=0))


def wire(ax, *pts):
    ax.plot(*zip(*pts), color=INK, lw=0.7, solid_joinstyle="miter")


def box(ax, cx, cy, w, h, title, sub=None, fc="#dbe7f7", ec="#2a5ca8", ts=6.3, ss=5.4):
    ax.add_patch(FancyBboxPatch((cx - w / 2, cy - h / 2), w, h, boxstyle="round,pad=0,rounding_size=2.0", fc=fc, ec=ec, lw=0.7))
    if sub:
        ax.text(cx, cy + h * 0.17, title, ha="center", va="center", fontsize=ts, fontweight="bold", color=INK)
        ax.text(cx, cy - h * 0.2, sub, ha="center", va="center", fontsize=ss, color="#333")
    else:
        ax.text(cx, cy, title, ha="center", va="center", fontsize=ts, color=INK, linespacing=1.0)


# ======================= Fig. 1: block diagram =======================
def fig_block():
    fig, ax = canvas(3.15, ylim=(0, 106))
    for (x0, x1, lab, ec) in ((1.5, 46, "Analog front-end and ADC (Arduino Uno)", "#2a5ca8"),
                              (54, 98.5, "Laptop (Python backend and web dashboard)", "#2e7d4a")):
        ax.add_patch(FancyBboxPatch((x0, 3), x1 - x0, 96, boxstyle="round,pad=0,rounding_size=2.5", fc="none", ec=ec, lw=0.6, ls=(0, (3, 2))))
        ax.text((x0 + x1) / 2, 102, lab, ha="center", va="center", fontsize=5.8, fontweight="bold", color=ec)
    ys = [88, 71, 54, 37, 20]
    left = [("12 V DC motor", "geared, about 200 RPM, load rig"), ("Shunt resistor", "0.1 Ω, low side: $V = IR$"),
            ("Differential amplifier", "LM358, gain $G$ = 20"), ("Sallen-Key low-pass", "$f_0$ = 232 Hz, $Q$ = 0.73"),
            ("Arduino Uno ADC", "10-bit, 1 kHz, pin A0")]
    fcs = ["#fde8cf", "#dbe7f7", "#dbe7f7", "#dbe7f7", "#e6dcf3"]
    ecs = ["#c77700", "#2a5ca8", "#2a5ca8", "#2a5ca8", "#6b3fa0"]
    for y, (t, s), fc, ec in zip(ys, left, fcs, ecs):
        box(ax, 23.75, y, 38, 11.5, t, s, fc, ec)
    for a, b in zip(ys[:-1], ys[1:]):
        arrow(ax, (23.75, a - 5.75), (23.75, b + 5.75))
    right = [("Feature extraction", "1 s window, 11 features"), ("Random Forest", "100 trees, class probabilities"),
             ("Smoothing and hysteresis", "EMA $α$ = 0.25, switch at 0.6"), ("Live web dashboard", "waveform, spectrum, verdict"),
             ("Alert and event log", "fault type and confidence")]
    for y, (t, s) in zip(ys[::-1], right):
        box(ax, 76.25, y, 38, 11.5, t, s, "#dcefe0" if y < 60 else "#fde8cf", "#2e7d4a" if y < 60 else "#c77700")
    for a, b in zip(ys[::-1][:-1], ys[::-1][1:]):
        arrow(ax, (76.25, a + 5.75), (76.25, b - 5.75))
    arrow(ax, (42.75, 20), (57.25, 20))
    ax.text(50, 22.4, "USB\nserial", ha="center", va="bottom", fontsize=5.0, color="#333", linespacing=0.95)
    save(fig, "fig_block")


# ======================= Fig. 2: flowchart =======================
def fig_flow():
    fig, ax = canvas(3.65, ylim=(0, 120))
    ys = [108, 97, 86, 75, 64, 53, 42]
    steps = ["Motor runs: normal, overload or friction",
             "Shunt, LM358 amplifier (×20) and\nSallen-Key filter (232 Hz)",
             "Arduino ADC samples at 1 kHz\n(10-bit counts, pin A0)",
             "Counts to amperes; 1 s sliding\nwindow with 50 ms hop",
             "Extract 11 time- and\nfrequency-domain features",
             "Random Forest: 100 trees vote\non the motor condition",
             "EMA smoothing; label switches\nwhen probability ≥ 0.6"]
    ax.add_patch(Ellipse((45, 116.5), 20, 6.0, fc="#fdf1c9", ec="#b8860b", lw=0.7))
    ax.text(45, 116.5, "START", ha="center", va="center", fontsize=6.0, fontweight="bold")
    for y, t in zip(ys, steps):
        fc, ec = ("#dbe7f7", "#2a5ca8") if y > 74 else ("#dcefe0", "#2e7d4a")
        box(ax, 45, y, 64, 8.6, t, None, fc, ec, ts=5.9)
    arrow(ax, (45, 113.5), (45, ys[0] + 4.3))
    for a, b in zip(ys[:-1], ys[1:]):
        arrow(ax, (45, a - 4.3), (45, b + 4.3))
    dy = 29
    ax.add_patch(Polygon([(45, dy + 7), (65, dy), (45, dy - 7), (25, dy)], closed=True, fc="#fff4d6", ec="#b8860b", lw=0.7))
    ax.text(45, dy, "Fault\ndetected?", ha="center", va="center", fontsize=5.8, linespacing=0.95)
    arrow(ax, (45, ys[-1] - 4.3), (45, dy + 7))
    oy = 15
    box(ax, 17, oy, 30, 8.6, "Status: Normal", None, "#dcefe0", "#2e7d4a", ts=5.9)
    box(ax, 73, oy, 34, 8.6, "Alert: fault type\nand confidence", None, "#f9dcd9", "#c0392b", ts=5.9)
    wire(ax, (25, dy), (17, dy)); arrow(ax, (17, dy), (17, oy + 4.3)); ax.text(21, dy + 2.2, "No", fontsize=5.6, ha="center")
    wire(ax, (65, dy), (73, dy)); arrow(ax, (73, dy), (73, oy + 4.3)); ax.text(69, dy + 2.2, "Yes", fontsize=5.6, ha="center")
    uy = 3.6
    box(ax, 45, uy, 64, 6.2, "Update dashboard and event log", None, "#fde8cf", "#c77700", ts=5.9)
    wire(ax, (17, oy - 4.3), (17, 8.6), (45, 8.6)); wire(ax, (73, oy - 4.3), (73, 8.6), (45, 8.6)); arrow(ax, (45, 8.6), (45, uy + 3.1))
    wire(ax, (77, uy), (92, uy), (92, ys[2])); arrow(ax, (92, ys[2]), (77, ys[2]))
    ax.text(95.2, 50, "next 50 ms", rotation=90, ha="center", va="center", fontsize=5.6, color="#333")
    save(fig, "fig_flow")


# ======================= Fig. 3: schematic =======================
def res_h(ax, x0, x1, y, n=6, amp=1.8):
    xs = np.linspace(x0 + 1.6, x1 - 1.6, 2 * n + 1)
    pts = [(x0, y), (x0 + 1.6, y)] + [(x, y + (amp if i % 2 else -amp)) for i, x in enumerate(xs[1:-1], 1)] + [(x1 - 1.6, y), (x1, y)]
    ax.plot(*zip(*pts), color=INK, lw=0.7, solid_joinstyle="miter")


def res_v(ax, x, y0, y1, n=6, amp=1.8):
    ys = np.linspace(y0 - 1.6, y1 + 1.6, 2 * n + 1)
    pts = [(x, y0), (x, y0 - 1.6)] + [(x + (amp if i % 2 else -amp), y) for i, y in enumerate(ys[1:-1], 1)] + [(x, y1 + 1.6), (x, y1)]
    ax.plot(*zip(*pts), color=INK, lw=0.7, solid_joinstyle="miter")


def cap_h(ax, x0, x1, y, gap=1.6, h=3.6):
    m = (x0 + x1) / 2
    ax.plot([x0, m - gap / 2], [y, y], color=INK, lw=0.7); ax.plot([m + gap / 2, x1], [y, y], color=INK, lw=0.7)
    for dx in (-gap / 2, gap / 2):
        ax.plot([m + dx, m + dx], [y - h, y + h], color=INK, lw=0.9)


def cap_v(ax, x, y0, y1, gap=1.6, h=3.6):
    m = (y0 + y1) / 2
    ax.plot([x, x], [y0, m + gap / 2], color=INK, lw=0.7); ax.plot([x, x], [m - gap / 2, y1], color=INK, lw=0.7)
    for dy in (-gap / 2, gap / 2):
        ax.plot([x - h, x + h], [m + dy, m + dy], color=INK, lw=0.9)


def gnd(ax, x, y):
    ax.plot([x, x], [y, y - 2], color=INK, lw=0.7)
    for i, w in enumerate((3.4, 2.2, 1.0)):
        ax.plot([x - w, x + w], [y - 2 - i * 1.2] * 2, color=INK, lw=0.8)


def dot(ax, x, y):
    ax.add_patch(Circle((x, y), 0.9, color=INK, zorder=5))


def opamp(ax, xl, yc, left_pointing=False, hh=12, w=23):
    tip = xl - w if left_pointing else xl + w
    ax.add_patch(Polygon([(xl, yc + hh), (xl, yc - hh), (tip, yc)], closed=True, fc="#f4f4f4", ec=INK, lw=0.8, zorder=3))


def fig_schematic():
    fig, ax = canvas(3.14, ylim=(0, 92)); ax.set_aspect("equal", adjustable="datalim")
    fs = 5.6
    # ---------- row (a): shunt + differential amplifier ----------
    ax.text(1.5, 90, "(a) Shunt and differential amplifier (gain = 200 kΩ / 10 kΩ = 20)", fontsize=5.8, fontweight="bold", va="center")
    wire(ax, (8, 83), (16, 83)); ax.text(12, 85.4, "+12 V", ha="center", fontsize=fs)
    wire(ax, (12, 83), (12, 77.5)); ax.add_patch(Circle((12, 73), 4.5, fc="white", ec=INK, lw=0.8))
    ax.text(12, 73, "M", ha="center", va="center", fontsize=6.4, fontweight="bold")
    wire(ax, (12, 68.5), (12, 65)); dot(ax, 12, 65)
    res_v(ax, 12, 65, 53); ax.text(9.6, 59, "$R_s$\n0.1 Ω", fontsize=fs, ha="right", va="center", linespacing=0.95)
    wire(ax, (12, 53), (12, 51)); gnd(ax, 12, 51)
    ax.text(8.2, 66.8, "$V_s$", fontsize=fs, ha="center", va="center")
    # + input (lower) from the shunt top
    wire(ax, (12, 65), (19, 65), (19, 57), (22, 57)); res_h(ax, 22, 34, 57); wire(ax, (34, 57), (44, 57)); dot(ax, 38, 57)
    ax.text(28, 60.4, "$R_{in}$ 10 kΩ", fontsize=fs, ha="center")
    res_v(ax, 38, 57, 47); ax.text(35.6, 52, "$R_g$\n200 kΩ", fontsize=fs, ha="right", va="center", linespacing=0.95)
    wire(ax, (38, 47), (38, 45)); gnd(ax, 38, 45)
    # - input (upper) returned to ground
    gnd(ax, 24, 69); wire(ax, (24, 69), (28, 69)); res_h(ax, 28, 38, 69); wire(ax, (38, 69), (44, 69)); dot(ax, 40, 69)
    ax.text(33, 72.6, "$R_{in}$ 10 kΩ", fontsize=fs, ha="center")
    opamp(ax, 44, 63)
    ax.text(46.2, 69, "−", fontsize=7, va="center"); ax.text(46.2, 57, "+", fontsize=7, va="center")
    ax.text(54, 63, "LM358\n(A)", fontsize=5.2, ha="center", va="center", linespacing=0.95)
    # feedback and output
    dot(ax, 72, 63); wire(ax, (67, 63), (84, 63)); wire(ax, (72, 63), (72, 82), (66, 82)); res_h(ax, 50, 66, 82)
    wire(ax, (50, 82), (40, 82), (40, 69))
    ax.text(58, 85.6, "$R_f$ 200 kΩ", fontsize=fs, ha="center")
    ax.text(79, 66.3, "$V_a$", fontsize=fs, ha="center")
    ax.text(70, 50, "supply:\n5 V, GND", fontsize=5.0, color="#555", linespacing=0.95)
    wire(ax, (84, 63), (92, 63), (92, 26))
    # ---------- row (b): Sallen-Key low-pass, signal flows right to left ----------
    wire(ax, (92, 26), (90, 26)); res_h(ax, 80, 90, 26); wire(ax, (80, 26), (76, 26)); dot(ax, 76, 26)
    ax.text(85, 29.6, "$R_1$ 10 kΩ", fontsize=fs, ha="center")
    wire(ax, (76, 26), (74, 26)); res_h(ax, 66, 74, 26); wire(ax, (66, 26), (64, 26)); dot(ax, 64, 26)
    ax.text(70, 29.6, "$R_2$ 10 kΩ", fontsize=fs, ha="center")
    wire(ax, (64, 26), (56, 26))
    cap_v(ax, 64, 26, 14); ax.text(70, 20, "$C_2$\n47 nF", fontsize=fs, va="center", linespacing=0.95)
    wire(ax, (64, 14), (64, 12)); gnd(ax, 64, 12)
    opamp(ax, 56, 23, left_pointing=True, hh=10, w=21)
    ax.text(53.8, 26, "+", fontsize=7, va="center", ha="right"); ax.text(53.8, 20, "−", fontsize=7, va="center", ha="right")
    ax.text(45.5, 23, "LM358\n(B)", fontsize=5.2, ha="center", va="center", linespacing=0.95)
    wire(ax, (56, 20), (59, 20), (59, 8), (30, 8), (30, 23)); dot(ax, 30, 23)
    wire(ax, (76, 26), (76, 38), (58, 38)); cap_h(ax, 50, 58, 38); wire(ax, (50, 38), (30, 38), (30, 23))
    ax.text(54, 44.6, "$C_1$ 100 nF", fontsize=fs, ha="center")
    ax.text(25, 26.3, "$V_f$", fontsize=fs, ha="center")
    ax.add_patch(FancyBboxPatch((1.5, 18), 10, 10, boxstyle="round,pad=0,rounding_size=1.2", fc="#e6dcf3", ec="#6b3fa0", lw=0.7))
    ax.text(6.5, 23, "A0", ha="center", va="center", fontsize=6.2, fontweight="bold")
    arrow(ax, (35, 23), (11.8, 23)); ax.text(6.5, 15.8, "Arduino\nADC", ha="center", va="top", fontsize=5.0, linespacing=0.95)
    ax.text(1.5, 3, "(b) Unity-gain Sallen-Key low-pass filter ($f_0$ = 232 Hz, $Q$ = 0.73)", fontsize=5.8, fontweight="bold", va="center")
    save(fig, "fig_schematic")


if __name__ == "__main__":
    fig_block(); fig_flow(); fig_schematic(); print("ok")
