"""Layout engine reproducing the IEEE conference Word template (A4, Times New Roman, two columns).
Every number below was measured from the reference PDF."""
import os
import re
from dataclasses import dataclass

import fitz

from common import ensure_fonts

FONT_DIR = ensure_fonts()
FILES = {"r": "times.ttf", "b": "timesbd.ttf", "i": "timesi.ttf", "bi": "timesbi.ttf", "m": "cambriamath.ttf"}
FONT = {k: fitz.Font(fontfile=os.path.join(FONT_DIR, v)) for k, v in FILES.items()}

NBSP = chr(0xA0)  # no-break space: kept inside one word, drawn with the ordinary space glyph
PAGE_W, PAGE_H = 595.22, 842.0
COLS = [(45.4, 291.1), (306.6, 552.5)]
COL_W = 245.7
TOP, TOP1, BOTTOM = 54.0, 328.7, 770.0   # column tops (pages 2+, page 1) and column bottom
PITCH = {10: 11.5, 9: 10.35, 8: 9.2}


def tlen(text, fk, size):
    return FONT[fk].text_length(text.replace(NBSP, " "), fontsize=size)   # NBSP is drawn with the space glyph


# ------------------------------------------------------------------ inline markup
@dataclass
class Seg:
    t: str
    f: str
    s: float
    rise: float = 0.0

    @property
    def w(self):
        return tlen(self.t, self.f, self.s)


def _mathify(ch, upright):
    if upright:
        return ch
    if "a" <= ch <= "z":
        return "ℎ" if ch == "h" else chr(0x1D44E + ord(ch) - 97)
    if "A" <= ch <= "Z":
        return chr(0x1D434 + ord(ch) - 65)
    if "α" <= ch <= "ω" and ch != "ς":
        return chr(0x1D6FC + ord(ch) - 0x3B1)
    return ch


_TAG = re.compile(r"(</?(?:i|b|bi|m|sub|sup|up)>)")


def parse(markup, size=10.0, base="r"):
    """Tags: <i> <b> <bi> <m> (math italic, Cambria Math) <up> (upright inside <m>) <sub> <sup>."""
    segs, it, bd, math, up, sub, sup = [], False, False, False, False, 0, 0
    for tok in _TAG.split(markup):
        if not tok:
            continue
        m = re.fullmatch(r"<(/?)(i|b|bi|m|sub|sup|up)>", tok)
        if m:
            on, tag = not m.group(1), m.group(2)
            if tag == "i": it = on
            elif tag == "b": bd = on
            elif tag == "bi": it = bd = on
            elif tag == "m": math = on
            elif tag == "up": up = on
            elif tag == "sub": sub += 1 if on else -1
            else: sup += 1 if on else -1
            continue
        s = size * (0.7 if (sub or sup) else 1.0)
        rise = size * 0.38 if sup else (-size * 0.2 if sub else 0.0)
        if math:
            fk, text = "m", "".join(_mathify(c, up) for c in tok)
        else:
            fk = {(0, 0): base, (1, 0): "i", (0, 1): "b", (1, 1): "bi"}[(int(it), int(bd))] if base == "r" else base
            text = tok
        run, runf = "", fk
        for c in text:  # fall back to Cambria Math for glyphs the text font lacks
            f2 = fk if (FONT[fk].has_glyph(ord(c)) or c in " " + NBSP) else ("m" if FONT["m"].has_glyph(ord(c)) else fk)
            if f2 != runf and run:
                segs.append(Seg(run, runf, s, rise)); run = ""
            runf = f2
            run += c
        if run:
            segs.append(Seg(run, runf, s, rise))
    return segs


# ------------------------------------------------------------------ words and lines
@dataclass
class Word:
    segs: list
    w: float
    sp: float


def to_words(segs):
    words, cur = [], []
    for sg in segs:
        parts = sg.t.split(" ")
        for k, p in enumerate(parts):
            if p:
                cur.append(Seg(p, sg.f, sg.s, sg.rise))
            if k < len(parts) - 1 and cur:
                words.append(Word(cur, sum(x.w for x in cur), 0.25 * sg.s)); cur = []
    if cur:
        words.append(Word(cur, sum(x.w for x in cur), 0.25 * cur[-1].s))
    return words


@dataclass
class Line:
    words: list
    x_off: float
    avail: float
    last: bool = False
    align: str = "justify"

    @property
    def natural(self):
        return sum(w.w for w in self.words) + sum(w.sp for w in self.words[:-1])


def break_lines(words, width, first_indent=0.0, indent=0.0, align="justify"):
    lines, cur, curw = [], [], 0.0
    avail, x_off = width - first_indent, first_indent
    for w in words:
        add = (cur[-1].sp if cur else 0.0) + w.w
        if cur and curw + add > avail + 1e-6:
            lines.append(Line(cur, x_off, avail, False, align))
            cur, curw, avail, x_off = [w], w.w, width - indent, indent
        else:
            cur.append(w); curw += add
    if cur:
        lines.append(Line(cur, x_off, avail, True, align))
    return lines


# ------------------------------------------------------------------ page operations
class Page:
    def __init__(self):
        self.texts, self.rules, self.images, self.discs = [], [], [], []

    def text(self, x, y, t, fk, size):
        self.texts.append((x, y, t.replace(NBSP, " "), fk, size))

    def rule(self, x0, y0, x1, y1, w=0.5):
        self.rules.append((x0, y0, x1, y1, w))

    def rect(self, x0, y0, x1, y1, w=0.5):
        for a in ((x0, y0, x1, y0), (x0, y1, x1, y1), (x0, y0, x0, y1), (x1, y0, x1, y1)):
            self.rule(*a, w)

    def disc(self, x, y, r):
        self.discs.append((x, y, r))

    def image(self, rect, path):
        self.images.append((rect, path))

    def draw_line(self, ln, x0, y):
        n, nat, extra = len(ln.words), ln.natural, 0.0
        if ln.align == "center":
            x = x0 + ln.x_off + ln.avail / 2 - nat / 2
        else:
            x = x0 + ln.x_off
            if ln.align == "justify" and not ln.last and n > 1:
                extra = (ln.avail - nat) / (n - 1)
        for k, w in enumerate(ln.words):
            xx = x
            for sg in w.segs:
                self.text(xx, y - sg.rise, sg.t, sg.f, sg.s)
                xx += sg.w
            x += w.w + (w.sp + extra if k < n - 1 else 0)


# ------------------------------------------------------------------ equation boxes
class MBox:
    def __init__(self, w, asc, desc, draw):
        self.w, self.asc, self.desc, self.draw = w, asc, desc, draw


def mtext(markup, size=10.0, plain=False):
    segs = parse(markup if plain else "<m>" + markup + "</m>", size)
    w = sum(s.w for s in segs)
    asc = max([0.72 * size] + [0.72 * s.s + max(s.rise, 0) for s in segs])
    desc = max([0.22 * size] + [0.22 * s.s - min(s.rise, 0) for s in segs])

    def draw(pg, x, y):
        for s in segs:
            pg.text(x, y - s.rise, s.t, s.f, s.s); x += s.w
    return MBox(w, asc, desc, draw)


def hbox(items, gap=0.0):
    w = sum(i.w for i in items) + gap * (len(items) - 1)

    def draw(pg, x, y):
        for i in items:
            i.draw(pg, x, y); x += i.w + gap
    return MBox(w, max(i.asc for i in items), max(i.desc for i in items), draw)


def frac(num, den, size=10.0):
    axis, pad = 0.26 * size, 1.3
    w = max(num.w, den.w) + 3.0

    def draw(pg, x, y):
        yr = y - axis
        pg.rule(x, yr, x + w, yr, 0.5)
        num.draw(pg, x + (w - num.w) / 2, yr - pad - num.desc)
        den.draw(pg, x + (w - den.w) / 2, yr + pad + den.asc)
    return MBox(w, axis + pad + num.asc + num.desc, den.asc + den.desc + pad - axis, draw)


def sqrt(inner, size=10.0):
    def draw(pg, x, y):
        top, bot = y - inner.asc - 1.8, y + inner.desc
        mid = (top + bot) / 2 + 1.0
        pg.rule(x, mid, x + 1.5, mid - 1.0, 0.5)
        pg.rule(x + 1.5, mid - 1.0, x + 3.4, bot, 0.7)
        pg.rule(x + 3.4, bot, x + 5.6, top, 0.5)
        pg.rule(x + 5.6, top, x + 6.2 + inner.w + 1.0, top, 0.5)
        inner.draw(pg, x + 6.2, y)
    return MBox(inner.w + 7.2, inner.asc + 2.6, inner.desc + 0.6, draw)


def sigma(lower, upper, size=10.0):
    sg = tlen("∑", "m", size * 1.35)
    lo, up = mtext(lower, 7.0), mtext(upper, 7.0)
    w = max(sg, lo.w, up.w) + 2

    def draw(pg, x, y):
        pg.text(x + (w - sg) / 2, y + 0.6, "∑", "m", size * 1.35)
        up.draw(pg, x + (w - up.w) / 2, y - size * 1.0)
        lo.draw(pg, x + (w - lo.w) / 2, y + size * 1.28)
    return MBox(w, size * 1.0 + up.asc, size * 1.28 + lo.desc, draw)


def paren(inner):
    """Parentheses that grow with the box they enclose (Cambria Math glyphs scaled to the height)."""
    h = inner.asc + inner.desc
    fs = max(10.0, h * 1.02)
    pw = tlen("(", "m", fs)
    cy = -(inner.asc - inner.desc) / 2        # target centre, relative to the baseline (up is negative)

    def draw(pg, x, y):
        by = y + cy + 0.245 * fs
        pg.text(x, by, "(", "m", fs)
        inner.draw(pg, x + pw, y)
        pg.text(x + pw + inner.w, by, ")", "m", fs)
    return MBox(inner.w + 2 * pw, max(inner.asc, 0.73 * fs - cy * 0), max(inner.desc, 0.24 * fs), draw)


# ------------------------------------------------------------------ spacing rules (baseline to baseline)
_GAPS = {
    ("p", "p"): 23.5, ("p", "sec"): 23.6, ("sec", "p"): 25.4, ("sec", "sub"): 23.4, ("sub", "p"): 25.6,
    ("p", "sub"): 25.4, ("sub", "sub"): 25.4, ("p", "num"): 23.5, ("num", "p"): 23.5, ("p", "lbl"): 23.5,
    ("lbl", "eq"): 23.9, ("eq", "lbl"): 23.3, ("eq", "p"): 23.3, ("p", "eq"): 23.9, ("lbl", "bul"): 24.2,
    ("bul", "bul"): 12.2, ("bul", "lbl"): 23.5, ("bul", "p"): 23.5, ("bul", "num"): 23.5, ("bul", "eq"): 23.8,
    ("eq", "bul"): 24.2, ("eq", "num"): 23.5, ("cap", "p"): 22.9, ("cap", "sec"): 23.6, ("cap", "sub"): 25.4,
    ("cap", "num"): 23.5, ("cap", "lbl"): 23.5, ("tab", "p"): 23.1, ("tab", "sec"): 23.6, ("tab", "sub"): 25.4,
    ("tab", "num"): 23.1, ("tab", "lbl"): 23.1, ("kw", "sec"): 31.4, ("abs", "kw"): 20.6, ("p", "olist"): 23.5,
    ("olist", "olist"): 23.5, ("olist", "p"): 23.5, ("olist", "sec"): 23.6, ("refhead", "ref"): 25.2,
    ("ref", "ref"): 11.6, ("p", "refhead"): 23.6, ("lbl", "p"): 23.5, ("bul", "sec"): 23.6, ("eq", "sec"): 23.6,
    ("num", "lbl"): 23.5, ("num", "eq"): 23.9, ("lbl", "lbl"): 23.5, ("num", "num"): 23.5, ("num", "bul"): 24.2,
    ("sec", "lbl"): 25.4, ("sub", "lbl"): 25.6, ("sub", "num"): 25.6, ("sec", "num"): 25.4,
}


def gap(prev, cur):
    return _GAPS.get((prev, cur), 23.5)


# ------------------------------------------------------------------ elements
class Text:
    """A paragraph-like element: lines of one size, constant pitch, splittable between lines."""
    def __init__(self, kind, lines, size=10, pitch=None, keep_next=False, mark=None):
        self.kind, self.lines, self.size = kind, lines, size
        self.pitch = pitch or PITCH[size]
        self.keep_next, self.mark, self.cont = keep_next, mark, False


class Block:
    floating = False


class Equation(Block):
    kind = "eq"

    def __init__(self, box, number):
        self.box, self.number = box, number
        self.asc, self.desc = max(box.asc, 8.9), box.desc
        self.height = self.asc + self.desc

    def baseline(self, cur, prev, y_top):
        if cur is None:
            return y_top + self.asc
        return cur + gap(prev, "eq") + max(0.0, self.asc - 9.0)

    def top_y(self, cur, prev, y_top):
        return self.baseline(cur, prev, y_top) - self.asc

    def draw(self, pg, x0, top):
        b = top + self.asc
        self.box.draw(pg, x0 + COL_W / 2 - 8 - self.box.w / 2, b)
        if self.number is not None:
            t = f"({self.number})"
            pg.text(x0 + COL_W - 26 - tlen(t, "r", 10), b, t, "r", 10)
        return b

    def after(self, top):
        return top + self.asc + max(0.0, self.desc - 3.0), "eq"


class Figure(Block):
    kind, floating = "fig", True

    def __init__(self, path, caption_lines):
        self.path, self.cap = path, caption_lines
        r = fitz.open(path)[0].rect
        self.w, self.h = r.width, r.height
        self.cap_off = 13.5
        self.height = self.h + self.cap_off + (len(self.cap) - 1) * 9.2 + 2.2

    def top_y(self, cur, prev, y_top):
        return y_top if cur is None else cur + 16.0

    def draw(self, pg, x0, top):
        x = x0 + (COL_W - self.w) / 2
        pg.image(fitz.Rect(x, top, x + self.w, top + self.h), self.path)
        for k, ln in enumerate(self.cap):
            pg.draw_line(ln, x0, top + self.h + self.cap_off + k * 9.2)

    def after(self, top):
        return top + self.h + self.cap_off + (len(self.cap) - 1) * 9.2, "cap"


class Table(Block):
    kind, floating = "tab", True
    ROW_PAD = 0.4

    def __init__(self, cap_lines, widths, rows, header_rows=1, pad=5.0, size=8):
        self.cap, self.widths, self.pad, self.size = cap_lines, widths, pad, size
        self.rows = []
        for r, row in enumerate(rows):
            cells = []
            for c, text in enumerate(row):
                mk = ("<b>" + text + "</b>") if r < header_rows else text
                words = to_words(parse(mk, size))
                cells.append(break_lines(words, widths[c] - 2 * pad, align="center"))
            n = max(len(c) for c in cells)
            self.rows.append((cells, n * 9.2 + self.ROW_PAD))
        self.cap_h = 7.2 + (len(cap_lines) - 1) * 9.2
        self.body_h = sum(h for _, h in self.rows)
        self.height = self.cap_h + 14.5 + self.body_h + 0.1

    def top_y(self, cur, prev, y_top):
        return y_top if cur is None else cur + 23.5 - 7.2

    def draw(self, pg, x0, top):
        for k, ln in enumerate(self.cap):
            pg.draw_line(ln, x0, top + 7.2 + k * 9.2)
        y = top + self.cap_h + 14.5
        total_w = sum(self.widths)
        pg.rule(x0, y, x0 + total_w, y)
        for cells, h in self.rows:
            x = x0
            for c, ln_list in enumerate(cells):
                for k, ln in enumerate(ln_list):
                    cx = x + self.pad
                    pg.draw_line(ln, cx, y + 7.8 + k * 9.2)
                x += self.widths[c]
            y += h
            pg.rule(x0, y, x0 + total_w, y)
        x = x0
        for w in self.widths + [0]:
            pg.rule(x, top + self.cap_h + 14.5, x, y)
            x += w

    def after(self, top):
        return top + self.height - 0.1, "tab"


# ------------------------------------------------------------------ the document flow
class Doc:
    def __init__(self):
        self.pages = [Page()]
        self.col, self.cur, self.prev, self.deferred = 0, None, None, []

    def pg(self):
        return self.pages[self.col // 2]

    def x0(self):
        return COLS[self.col % 2][0]

    def y_top(self):
        return TOP1 if self.col // 2 == 0 else TOP

    def new_col(self):
        self.col += 1
        while self.col // 2 >= len(self.pages):
            self.pages.append(Page())
        self.cur = self.prev = None
        pend, self.deferred = self.deferred, []
        for el in pend:
            if not self.try_place(el):
                self.deferred.append(el)

    def limit(self, size):
        return BOTTOM - 0.216 * size

    def try_place(self, el):
        top = el.top_y(self.cur, self.prev, self.y_top())
        if top + el.height > BOTTOM + 0.01:
            return False
        el.draw(self.pg(), self.x0(), top)
        self.cur, self.prev = el.after(top)
        return True

    def place_text(self, el, queue):
        size = el.size
        while True:
            y0 = self.y_top() + 0.9 * size if self.cur is None else self.cur + gap(self.prev, el.kind)
            if el.keep_next and queue and self.cur is not None:
                nx = queue[0]
                if isinstance(nx, Text):
                    ny = y0 + gap(el.kind, nx.kind) + (min(2, len(nx.lines)) - 1) * nx.pitch
                    lim = self.limit(nx.size)
                else:
                    ny = nx.top_y(y0, el.kind, self.y_top()) + nx.height
                    lim = BOTTOM
                if ny > lim:
                    self.new_col(); continue
            n = len(el.lines)
            nfit = sum(1 for k in range(n) if y0 + k * el.pitch <= self.limit(size))
            if nfit < n:
                if n < 4 or nfit < 2:
                    nfit = 0
                elif n - nfit < 2:
                    nfit = max(0, n - 2)
                    if nfit < 2:
                        nfit = 0
            if nfit == 0:
                if self.cur is not None:
                    self.new_col(); continue
                nfit = n
            break
        pg, x0 = self.pg(), self.x0()
        for k in range(nfit):
            pg.draw_line(el.lines[k], x0, y0 + k * el.pitch)
        if el.mark and not el.cont:
            el.mark(pg, x0, y0)
        self.cur, self.prev = y0 + (nfit - 1) * el.pitch, el.kind
        if nfit < n:
            rest = Text(el.kind, el.lines[nfit:], size, el.pitch)
            rest.cont = True
            self.new_col()
            self.place_text(rest, queue)

    def flow(self, elements):
        queue = list(elements)
        while queue:
            el = queue.pop(0)
            if isinstance(el, Text):
                self.place_text(el, queue)
            elif el.floating:
                # a deferred float blocks later ones, so figures and tables keep their numbering order
                if self.deferred or not self.try_place(el):
                    self.deferred.append(el)
            else:
                if not self.try_place(el):
                    self.new_col()
                    if not self.try_place(el):
                        raise RuntimeError("block taller than a column")
        guard = 0
        while self.deferred:
            self.new_col(); guard += 1
            if guard > 6:
                raise RuntimeError("deferred floats do not fit")


# ------------------------------------------------------------------ rendering
def render(doc, path, title="", author=""):
    out = fitz.open()
    srcs = {}
    for pn, pg in enumerate(doc.pages):
        page = out.new_page(width=PAGE_W, height=PAGE_H)
        for rect, p in pg.images:
            srcs.setdefault(p, fitz.open(p))
            page.show_pdf_page(rect, srcs[p], 0)
        shape = page.new_shape()
        for x0, y0, x1, y1, w in pg.rules:
            shape.draw_line((x0, y0), (x1, y1)); shape.finish(width=w, color=(0, 0, 0), closePath=False)
        for x, y, r in pg.discs:
            shape.draw_circle((x, y), r); shape.finish(color=(0, 0, 0), fill=(0, 0, 0), width=0)
        shape.commit()
        tw = fitz.TextWriter(page.rect)
        for x, y, t, fk, size in pg.texts:
            tw.append((x, y), t, font=FONT[fk], fontsize=size)
        tw.write_text(page, color=(0, 0, 0))
    out.set_metadata({"title": title, "author": author, "producer": "PyMuPDF", "creator": "paper build script"})
    try:
        out.subset_fonts()
    except Exception as e:  # subsetting needs fontTools; the PDF is valid without it
        print("font subsetting skipped:", e)
    out.save(path, garbage=4, deflate=True)
    return len(out)
