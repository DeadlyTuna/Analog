"""Live telemetry: simulated Arduino -> features -> Random Forest -> ws://localhost:8765

Run:  python server.py
Hardware later: replace sim.step(CHUNK) with a serial reader that returns the
same ADC counts; the other stages (i, vs, va, vf) then come from adc_to_amps.
"""
import asyncio
import json

import joblib
import numpy as np
from websockets.asyncio.server import broadcast, serve

import train
from motor import (ADC_MAX, CLASSES, FEATURES, FS, GAIN, LPF_FC, LPF_Q, R_SHUNT, V_SAT, VREF,
                   MotorSim, adc_to_amps, extract)

CHUNK = FS // 20  # 50 ms of samples per frame
EMA = 0.25        # prediction smoothing per frame
SWITCH = 0.6      # a new label must reach this smoothed probability (hysteresis)


def rounded(x, d=4):
    return np.round(x, d).tolist()


async def run():
    bundle = joblib.load(train.MODEL_PATH) if train.MODEL_PATH.exists() else train.train()
    rf = bundle["model"]
    sim = MotorSim()
    window = adc_to_amps(sim.step(FS)["adc"])  # 1 s sliding window the model sees
    hello = json.dumps({
        "type": "hello", "source": "simulated", "classes": CLASSES, "features": FEATURES,
        "circuit": dict(r_shunt=R_SHUNT, gain=GAIN, fc=LPF_FC, q=LPF_Q, v_sat=V_SAT,
                        vref=VREF, adc_max=ADC_MAX, fs=FS),
        "model": {k: bundle[k] for k in ("accuracy", "confusion", "importance", "n_train", "n_test")}
                 | {"trees": len(rf.estimators_)},
    })
    clients = set()

    async def handler(ws):
        clients.add(ws)
        try:
            await ws.send(hello)
            async for raw in ws:
                try:
                    cmd = json.loads(raw)
                    sim.set(cmd["condition"], cmd.get("severity"))
                except (ValueError, KeyError, TypeError):
                    pass  # ignore malformed commands
        finally:
            clients.discard(ws)

    async with serve(handler, "localhost", 8765):
        print("streaming on ws://localhost:8765  (Ctrl+C to stop)")
        loop = asyncio.get_running_loop()
        tick, ema, label = loop.time(), None, None
        while True:
            t = sim.n / FS
            s = sim.step(CHUNK)
            window = np.concatenate([window[CHUNK:], adc_to_amps(s["adc"])])
            feat, spec = extract(window)
            per_tree = np.array([tree.predict_proba(feat[None])[0] for tree in rf.estimators_])
            p = per_tree.mean(0)  # exactly RandomForest.predict_proba
            ema = p if ema is None else (1 - EMA) * ema + EMA * p
            if label is None or ema.max() >= SWITCH:
                label = int(ema.argmax())
            broadcast(clients, json.dumps({
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


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        pass
