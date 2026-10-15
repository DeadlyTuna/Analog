"""Live telemetry: simulated Arduino -> features -> Random Forest -> WebSocket at /api/ws

Local:  python server.py   (ws://localhost:8765/api/ws)
Vercel: the "backend" service in vercel.json; the site connects to wss://<host>/api/ws.
Each connection drives its own simulated motor, because serverless instances share no memory.
Hardware later: replace sim.step(CHUNK) with a serial reader that returns the
same ADC counts; the other stages (i, vs, va, vf) then come from adc_to_amps.
"""
import asyncio
import json

import joblib
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

import train
from motor import (ADC_MAX, CLASSES, FEATURES, FS, GAIN, LPF_FC, LPF_Q, R_SHUNT, V_SAT, VREF,
                   MotorSim, adc_to_amps, extract)

CHUNK = FS // 20  # 50 ms of samples per frame
EMA = 0.25        # prediction smoothing per frame
SWITCH = 0.6      # a new label must reach this smoothed probability (hysteresis)

bundle = joblib.load(train.MODEL_PATH) if train.MODEL_PATH.exists() else train.train()
rf = bundle["model"]
HELLO = json.dumps({
    "type": "hello", "source": "simulated", "classes": CLASSES, "features": FEATURES,
    "circuit": dict(r_shunt=R_SHUNT, gain=GAIN, fc=LPF_FC, q=LPF_Q, v_sat=V_SAT,
                    vref=VREF, adc_max=ADC_MAX, fs=FS),
    "model": {k: bundle[k] for k in ("accuracy", "confusion", "importance", "n_train", "n_test")}
             | {"trees": len(rf.estimators_)},
})

app = FastAPI()


def rounded(x, d=4):
    return np.round(x, d).tolist()


@app.websocket("/api/ws")
async def stream(ws: WebSocket):
    await ws.accept()
    sim = MotorSim()
    window = adc_to_amps(sim.step(FS)["adc"])  # 1 s sliding window the model sees
    await ws.send_text(HELLO)

    async def commands():
        try:
            while True:
                try:
                    cmd = json.loads(await ws.receive_text())
                    sim.set(cmd["condition"], cmd.get("severity"))
                except (ValueError, KeyError, TypeError):
                    pass  # ignore malformed commands
        except WebSocketDisconnect:
            pass

    reader = asyncio.create_task(commands())
    loop = asyncio.get_running_loop()
    tick, ema, label = loop.time(), None, None
    try:
        while not reader.done():
            t = sim.n / FS
            s = sim.step(CHUNK)
            window = np.concatenate([window[CHUNK:], adc_to_amps(s["adc"])])
            feat, spec = extract(window)
            per_tree = np.array([tree.predict_proba(feat[None])[0] for tree in rf.estimators_])
            p = per_tree.mean(0)  # exactly RandomForest.predict_proba
            ema = p if ema is None else (1 - EMA) * ema + EMA * p
            if label is None or ema.max() >= SWITCH:
                label = int(ema.argmax())
            await ws.send_text(json.dumps({
                "type": "frame", "t": t,
                "i": rounded(s["i"]), "vs": rounded(s["v_shunt"] * 1e3, 2),
                "va": rounded(s["v_amp"]), "vf": rounded(s["v_filt"]), "adc": s["adc"].tolist(),
                "feat": rounded(feat, 5), "spec": rounded(spec * 1e3, 2),
                "probs": rounded(ema), "votes": per_tree.argmax(1).tolist(),
                "label": CLASSES[label],
                "truth": {"condition": sim.condition, "severity": sim.severity, "rpm": round(sim.rpm, 1)},
            }))
            tick += CHUNK / FS
            await asyncio.sleep(max(0, tick - loop.time()))
    except (WebSocketDisconnect, RuntimeError):
        pass  # client went away mid-send
    finally:
        reader.cancel()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="localhost", port=8765)
