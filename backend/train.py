"""Train the Random Forest on simulated 1 s windows.  Run:  python train.py

Retrain on real recordings once the hardware is built - simulated accuracy is optimistic.
"""
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import confusion_matrix
from sklearn.model_selection import train_test_split

from motor import CLASSES, FEATURES, FS, MotorSim, adc_to_amps, extract

MODEL_PATH = Path(__file__).with_name("model.joblib")


def window(rng, condition, severity):
    sim = MotorSim(rng, vary=True)
    sim.set(condition, severity)
    sim.settle()
    sim.step(FS // 2)  # let the filters settle
    return extract(adc_to_amps(sim.step(FS)["adc"]))[0]


def train(path=MODEL_PATH, n_per_class=400):
    rng = np.random.default_rng(0)
    X = np.array([window(rng, c, rng.uniform(0.25, 1)) for c in CLASSES for _ in range(n_per_class)])
    y = np.repeat(np.arange(len(CLASSES)), n_per_class)
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, stratify=y, random_state=0)
    rf = RandomForestClassifier(n_estimators=100, random_state=0).fit(Xtr, ytr)
    pred = rf.predict(Xte)
    bundle = dict(model=rf, accuracy=float((pred == yte).mean()),
                  confusion=confusion_matrix(yte, pred).tolist(),
                  importance=rf.feature_importances_.round(4).tolist(),
                  n_train=len(Xtr), n_test=len(Xte))
    joblib.dump(bundle, path)
    return bundle


if __name__ == "__main__":
    b = train()
    print(f"accuracy {b['accuracy']:.3f} on {b['n_test']} held-out simulated windows")
    print("confusion, rows = true", CLASSES, *b["confusion"], sep="\n  ")
    for name, imp in sorted(zip(FEATURES, b["importance"]), key=lambda t: -t[1]):
        print(f"  {name:<12}{imp:.3f}")
    assert b["accuracy"] > 0.9
