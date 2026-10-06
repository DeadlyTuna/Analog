# AI-Based Motor Fault Detection Using Analog Current Sensing

One website, one subject. The main project senses motor current with an analog front-end and classifies faults with a Random Forest. An industry extension shows the same idea scaled up to an industrial motor with embedded firmware.

| Route | What it shows |
|---|---|
| `/` | Overview: the idea, the signal chain, the fault signatures, the analog concepts covered, and the cost. |
| `/dashboard` | Live dashboard: AI verdict, current waveform, spectrum, timeline, and fault simulation. |
| `/lab` | 3D bench with live readings on every part. |
| `/how` | Live pipeline, circuit schematic, and the filter's Bode plot. |
| `/present` | Viva presentation: 20 slides with live data and speaker notes (N key). Arrow keys move between slides, and `#n` links to a slide. |
| `/industry` | Industry extension: an induction motor digital twin with MCU firmware (ADC, DMA, RTOS, DSP). Based on Vigil, by Sidhant. |

The main project's live data comes from the Python backend. The industry extension runs entirely in the browser. See [docs/adr-001-integrate-vigil.md](docs/adr-001-integrate-vigil.md).

## Run

Terminal 1, the Python backend for the main project. It trains the model on the first run:

```bash
cd backend
pip install -r requirements.txt
python server.py
```

Terminal 2, the website:

```bash
cd dashboard
npm install
npm run dev
```

Open http://localhost:3000. The industry extension does not need the backend.

## Checks

```bash
cd backend && python motor.py && python train.py
cd dashboard && npm run typecheck && npm run sim:test && npm run sim:tour
```

## Layout

| Path | What it does |
|---|---|
| `backend/motor.py` | Simulator for the motor and the analog chain, plus feature extraction. Circuit constants are at the top: set them to your real parts. |
| `backend/train.py` | Trains the Random Forest on simulated 1 s windows. Prints accuracy, the confusion matrix and feature importance. |
| `backend/server.py` | Streams samples, features and predictions over `ws://localhost:8765`. Accepts `{condition, severity}` commands. |
| `dashboard/app/` | Every page, under one root layout. `app/industry/` adds the extension's simulator and its `industry.css`, which is scoped to `.industry`. |
| `dashboard/vigil/` | Industry extension source (simulator engine, components, headless tests), imported as `@vigil/*`. It is restyled to the site's tokens through a bridge block in `app/globals.css`. |

## When the hardware arrives

1. Upload an Arduino sketch that prints one `analogRead(A0)` value per line at 1 kHz.
2. In `server.py`, replace `sim.step(CHUNK)` with a serial reader (pyserial) that returns those ADC counts.
3. Record real windows for each condition and retrain. The simulated accuracy (100%) is optimistic.
