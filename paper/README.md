# Conference paper

`conference_paper.pdf` is "AI-Based Motor Fault Detection Using Analog Current Sensing" in the layout of the IEEE conference Word template: A4, Times New Roman, two justified columns, 10 pt body, 24 pt title, 8 pt captions and references. It has 7 pages (the reference paper has 6).

The authors, affiliations and the conference line are placeholders copied from the template. Edit `AUTHORS` and `HEADER` in `content.py`, then rebuild.

All numbers in the paper are measured on the project's simulator (`../backend/motor.py`) and are written to `results.json` by `experiments.py`. Nothing was measured on hardware.

## Rebuild

Windows only: the build copies Times New Roman and Cambria Math from `C:\Windows\Fonts` into `.fonts/` (git-ignored, licensed fonts).

```bash
pip install pymupdf fonttools matplotlib numpy scipy scikit-learn joblib
python figs_data.py
python figs_diag.py
python build.py
```

`python experiments.py` re-measures every number (about 10 minutes) and rewrites `results.json`. Run it before `figs_data.py` if the backend or the model changes.

| File | What it does |
|---|---|
| `content.py` | The paper's text, tables, references and author placeholders. |
| `build.py` | Numbers the figures, tables, equations and citations, builds the equations, flows everything into columns. |
| `engine.py` | Layout engine with the template's measurements: margins, columns, line pitch, spacing, heading and caption styles. |
| `figs_data.py`, `figs_diag.py` | The figures: plots from the simulator, and the block diagram, flowchart and schematic. |
| `experiments.py` | Model comparison, stress tests, filter ablation, detection latency, false alarms, timing. |
| `common.py` | Paths and font preparation. |
