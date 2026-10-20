"""Shared paths and font preparation for the paper scripts."""
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent / "backend"
FIGS = HERE / "figs"
RESULTS = HERE / "results.json"
FONT_DIR = HERE / ".fonts"
NAMES = ("times", "timesbd", "timesi", "timesbi", "cambriamath")
# Times New Roman and Cambria Math are the fonts of the IEEE Word template; they come from the Windows font folder.
WIN_FONTS = Path(r"C:\Windows\Fonts")
# In these fonts one glyph is shared by two code points. Text extraction would then return a no-break space, a soft
# hyphen or a Greek question mark instead of a space, a hyphen or a semicolon, so the copies drop the extra mappings.
DUPLICATE_CODEPOINTS = (0xA0, 0xAD, 0x37E)


def ensure_fonts():
    if all((FONT_DIR / f"{n}.ttf").exists() for n in NAMES):
        return FONT_DIR
    from fontTools.ttLib import TTCollection, TTFont
    FONT_DIR.mkdir(exist_ok=True)
    fonts = {n: TTFont(WIN_FONTS / f"{n}.ttf") for n in NAMES[:4]}
    fonts["cambriamath"] = next(f for f in TTCollection(WIN_FONTS / "cambria.ttc").fonts
                                if "Math" in f["name"].getDebugName(4))
    for name, font in fonts.items():
        for table in font["cmap"].tables:
            for cp in DUPLICATE_CODEPOINTS:
                table.cmap.pop(cp, None)
        font.save(FONT_DIR / f"{name}.ttf")
    return FONT_DIR
