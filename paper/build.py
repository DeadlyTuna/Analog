"""Build the conference paper PDF.  Run: python build.py [out.pdf]"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from engine import *      # noqa: E402,F401
import content as C       # noqa: E402

FIGS = os.path.join(HERE, "figs")
FIGFILE = {"block": "fig_block", "flow": "fig_flow", "sch": "fig_schematic", "bode": "fig_bode", "stages": "fig_stages",
           "cond": "fig_conditions", "spec": "fig_spectra", "imp": "fig_importance", "resp": "fig_response"}
ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]


# ------------------------------------------------------------------ numbering and cross references
def strings_in_order(spec):
    for it in spec:
        k = it[0]
        if k in ("p", "p0", "olist", "bul", "lbl", "abs", "kw"):
            yield it[1]
        elif k == "fig":
            yield it[2]
        elif k == "tab":
            yield it[2]
            for row in it[4]:
                yield from row


def numbering(spec):
    figs = {it[1]: n for n, it in enumerate([i for i in spec if i[0] == "fig"], 1)}
    tabs = {it[1]: n for n, it in enumerate([i for i in spec if i[0] == "tab"], 1)}
    eqs = {it[1]: n for n, it in enumerate([i for i in spec if i[0] == "eq"], 1)}
    cites = {}
    for s in strings_in_order(spec):
        for m in re.finditer(r"\{cite:([a-z0-9,]+)\}", s):
            for key in m.group(1).split(","):
                cites.setdefault(key, len(cites) + 1)
    return figs, tabs, eqs, cites


def fmt_cites(nums):
    nums = sorted(set(nums))
    runs, i = [], 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        runs.append(f"[{nums[i]}]" if j == i else f"[{nums[i]}-{nums[j]}]")
        i = j + 1
    return ", ".join(runs)


UNIT = r"(?:V|mV|A|mA|Hz|kHz|Ω|kΩ|nF|ms|s|dB|W|mW|RPM|rev/s)"


def tidy(s):
    nb = chr(0xA0)
    s = re.sub(r"(?<=\d) %", "%", s)                                  # IEEE style: 100%, not 100 %
    s = re.sub(rf"(?<=\d) (?={UNIT}(?!\w))", nb, s)                    # keep a number with its unit
    s = re.sub(r"(Fig\.|Table|Equations?|Section) (?=[\dIVX(])", lambda m: m.group(1) + nb, s)
    return s


def make_resolver(figs, tabs, eqs, cites):
    def res(s):
        s = re.sub(r"\{fig:(\w+)\}", lambda m: f"Fig. {figs[m.group(1)]}", s)
        s = re.sub(r"\{tab:(\w+)\}", lambda m: f"Table {ROMAN[tabs[m.group(1)]]}", s)
        s = re.sub(r"\{eq:(\w+)\}", lambda m: f"({eqs[m.group(1)]})", s)
        s = re.sub(r"\{cite:([a-z0-9,]+)\}", lambda m: fmt_cites([cites[k] for k in m.group(1).split(",")]), s)
        return tidy(s)
    return res


# ------------------------------------------------------------------ equations
mt = mtext


def equations():
    return {
        "shunt": hbox([mt("V<sub>s</sub> = IR<sub>s</sub>")]),
        "gain": hbox([mt("V<sub>a</sub> = GV<sub>s</sub>,     G ="), frac(mt("R<sub>f</sub>"), mt("R<sub>in</sub>")), mt("= 20")], 3),
        "imax": hbox([mt("I<sub><up>max</up></sub> ="), frac(mt("V<sub><up>sat</up></sub>"), mt("GR<sub>s</sub>")), mt("= 1.75 <up>A</up>")], 3),
        "f0": hbox([mt("f<sub>0</sub> ="), frac(mt("1"), hbox([mt("2πR"), sqrt(mt("C<sub>1</sub>C<sub>2</sub>"))], 1))], 3),
        "q": hbox([mt("Q ="), frac(mt("1"), mt("2")), sqrt(frac(mt("C<sub>1</sub>"), mt("C<sub>2</sub>")))], 3),
        "h": hbox([mt("H(s) ="), frac(mt("1"), mt("s<sup>2</sup>R<sup>2</sup>C<sub>1</sub>C<sub>2</sub> + 2sRC<sub>2</sub> + 1"))], 3),
        "adc": hbox([mt("N = <up>round</up>"), paren(frac(mt("1023 V<sub>f</sub>"), mt("V<sub><up>ref</up></sub>")))], 1),
        "inv": hbox([mt("I ="), frac(mt("N V<sub><up>ref</up></sub>"), mt("1023 GR<sub>s</sub>"))], 3),
        "rms": hbox([mt("I<sub><up>rms</up></sub> ="), sqrt(hbox([frac(mt("1"), mt("L")), sigma("k = 1", "L"), mt("x<sub>k</sub><sup>2</sup>")], 1))], 3),
        "cf": hbox([mt("<up>CF</up> ="), frac(mt("I<sub><up>pk</up></sub>"), mt("I<sub><up>rms</up></sub>"))], 3),
        "vote": hbox([mt("P(c) ="), frac(mt("n<sub>c</sub>"), mt("T"))], 3),
        "ema": mt("q<sub>k</sub> = (1 − α) q<sub>k−1</sub> + α p<sub>k</sub>"),
    }


# ------------------------------------------------------------------ element constructors
def words_of(markup, size=10.0):
    return to_words(parse(markup, size))


def para(markup, indent=12.5, size=10, kind="p", keep_next=False, align="justify", hang=None, pitch=None, mark=None):
    w = words_of(markup, size)
    if hang is not None:
        lines = break_lines(w, COL_W, first_indent=hang, indent=hang, align=align)
    else:
        lines = break_lines(w, COL_W, first_indent=indent, align=align)
    return Text(kind, lines, size, pitch, keep_next, mark)


def heading_caps(num, title):
    words = []
    if num:
        sg = [Seg(num + ".", "r", 10)]
        words.append(Word(sg, sum(s.w for s in sg), 7.8))
    small_caps = title in ("Introduction", "References")   # the reference PDF uses small caps only for these two
    for t in title.upper().split():
        sg = ([Seg(t[0], "r", 10)] + ([Seg(t[1:], "r", 8)] if len(t) > 1 else [])) if small_caps else [Seg(t, "r", 10)]
        words.append(Word(sg, sum(s.w for s in sg), 2.5))
    return Text("sec" if num else "refhead", break_lines(words, COL_W, align="center"), 10, keep_next=True)


def heading_sub(letter, title):
    sg = [Seg(letter, "i", 10)]
    words = [Word(sg, sum(s.w for s in sg), 8.0)] + words_of("<i>" + title + "</i>")
    return Text("sub", break_lines(words, COL_W, align="left"), 10, keep_next=True)


def caption(label, text, upper=False):
    head = words_of(label, 8)
    head[-1].sp *= 2                                   # "Fig. 2.  Flowchart ..." has a double space
    lines = break_lines(head + words_of(text.upper() if upper else text, 8), 238.0, align="center")
    for ln in lines:                      # centre on the column, wrap a little narrower
        ln.avail = COL_W
    return lines


def bullet_mark(pg, x0, y):
    pg.disc(x0 + 19.8, y - 3.3, 1.7)


def build_elements(spec, res, eqs, boxes, cites):
    out = []
    fig_n = tab_n = 0
    for it in spec:
        k = it[0]
        if k == "abs":
            out.append(para(res(it[1]), indent=20.1, size=9, kind="abs", pitch=10.35))
        elif k == "kw":
            out.append(para(res(it[1]), indent=18.0, size=9, kind="kw", pitch=10.35))
        elif k == "sec":
            out.append(heading_caps(it[1], it[2]))
        elif k == "sub":
            out.append(heading_sub(it[1], it[2]))
        elif k == "num":
            out.append(Text("num", break_lines(words_of(it[1]), COL_W, align="left"), 10, keep_next=True))
        elif k == "p":
            out.append(para(res(it[1])))
        elif k == "p0":
            out.append(para(res(it[1]), indent=0))
        elif k == "lbl":
            out.append(Text("lbl", break_lines(words_of(res(it[1])), COL_W, align="left"), 10, keep_next=True))
        elif k == "bul":
            out.append(para(res(it[1]), kind="bul", hang=36.0, pitch=11.5, mark=bullet_mark))
        elif k == "olist":
            n = sum(1 for e in out if e.kind == "olist") + 1

            def mk(pg, x0, y, n=n):
                pg.text(x0 + 18, y, f"{n}.", "r", 10)
            out.append(para(res(it[1]), kind="olist", hang=36.0, mark=mk))
        elif k == "eq":
            n = list(eqs).index(it[1]) + 1
            out.append(Equation(boxes[it[1]], n))
        elif k == "fig":
            fig_n += 1
            out.append(Figure(os.path.join(FIGS, FIGFILE[it[1]] + ".pdf"), caption(f"Fig. {fig_n}.", res(it[2]))))
        elif k == "tab":
            tab_n += 1
            cap = caption(f"TABLE {ROMAN[tab_n]}.", res(it[2]), upper=True)
            rows = [[res(c) for c in row] for row in it[4]]
            out.append(Table(cap, it[3], rows))
        else:
            raise ValueError(k)
    # references
    out.append(heading_caps("", "References"))
    for key, n in sorted(cites.items(), key=lambda kv: kv[1]):
        def mk(pg, x0, y, n=n):
            pg.text(x0, y, f"[{n}]", "r", 8)
        out.append(para(C.REFS[key], size=8, kind="ref", hang=17.6, pitch=9.0, mark=mk))
    return out


# ------------------------------------------------------------------ first page: header, title, authors
def first_page(pg):
    a, sup, rest = C.HEADER
    parts = [(a, "b", 10, 0), (sup, "b", 6.5, 3.5), (rest, "b", 10, 0)]
    total = sum(tlen(t, f, s) for t, f, s, _ in parts)
    x = 553.2 - total
    for t, f, s, rise in parts:
        pg.text(x, 45.2 - rise, t, f, s); x += tlen(t, f, s)
    words = words_of(C.TITLE, 24)
    for k, ln in enumerate(break_lines(words, 507.1, align="center")):
        pg.draw_line(ln, 300.65 - 253.55, 81.1 + k * 27.6)
    authors = C.AUTHORS
    centers = [139.3, 296.0, 454.1]
    layout = [(centers[0], 154.3), (centers[1], 154.3), (centers[2], 154.3), (centers[1], 229.3)]
    for au, (cx, y0) in zip(authors, layout):
        lines = [(au["name"], "r"), (au["dept"], "i"), (au["inst"], "i"), (au["place"], "r"), (au["email"], "r")]
        for k, (t, f) in enumerate(lines):
            star = k == 0 and t.endswith("*")
            segs = [Seg(t.rstrip("*"), f, 9)] + ([Seg("*", f, 6.3, 3.4)] if star else [])
            w = sum(s.w for s in segs)
            xx = cx - w / 2
            for s in segs:
                pg.text(xx, y0 + k * 10.3 - s.rise, s.t, s.f, s.s); xx += s.w


def main(out_path):
    figs, tabs, eqs, cites = numbering(C.SPEC)
    res = make_resolver(figs, tabs, eqs, cites)
    boxes = equations()
    els = build_elements(C.SPEC, res, eqs, boxes, cites)
    doc = Doc()
    first_page(doc.pages[0])
    doc.flow(els)
    n = render(doc, out_path, title=C.TITLE, author="")
    return n, doc


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "conference_paper.pdf")
    pages, doc = main(out)
    print("pages:", pages, "->", out)
