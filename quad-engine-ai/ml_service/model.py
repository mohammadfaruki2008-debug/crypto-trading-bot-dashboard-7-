"""
Meta-labeler — XGBoost classifier with Platt scaling (calibration).

Target = 1 if price reached TP1 before SL, else 0.
Trains on labelled rows exported from the trades DB.

Usage:
    python model.py --train      # retrain weekly from data/training.csv
"""
from __future__ import annotations

import argparse
import logging
import os
import pickle
from typing import List

import numpy as np

log = logging.getLogger("model")

MODEL_PATH = os.getenv("META_MODEL_PATH", "data/meta_model.pkl")

# Must match src/ml/mlClient.ts buildFeatures() order
FEATURE_ORDER = [
    "signal_strength", "tqi", "efficiency_ratio", "atr_pct", "rsi",
    "macd_hist", "vol_ratio",
    "w_sats", "w_lorentzian", "w_squeeze", "w_smc",
    "w_rsidiv", "w_ichimoku", "w_macd", "w_volprofile",
]


class MetaLabeler:
    """Calibrated XGBoost meta-labeler."""

    def __init__(self, model=None) -> None:
        self.model = model

    @property
    def is_trained(self) -> bool:
        return self.model is not None

    @classmethod
    def load_or_new(cls) -> "MetaLabeler":
        if os.path.exists(MODEL_PATH):
            with open(MODEL_PATH, "rb") as f:
                return cls(pickle.load(f))
        log.warning("No trained meta-model found — using neutral fallback (0.5).")
        return cls(None)

    def predict_proba(self, features: List[float]) -> float:
        """Return calibrated P(TP1 before SL)."""
        if self.model is None:
            # Fallback: lean on signal strength (feature 0)
            return float(np.clip(features[0] if features else 0.5, 0.0, 1.0))
        x = np.array(features, dtype=float).reshape(1, -1)
        return float(self.model.predict_proba(x)[0, 1])

    def train(self, csv_path: str = "data/training.csv") -> None:
        """Train XGBoost + Platt calibration on labelled history."""
        import pandas as pd
        from sklearn.calibration import CalibratedClassifierCV
        from sklearn.model_selection import train_test_split
        from xgboost import XGBClassifier

        df = pd.read_csv(csv_path)
        X = df[FEATURE_ORDER].values
        y = df["target"].values  # 1 = TP1 before SL

        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, shuffle=False)

        base = XGBClassifier(
            n_estimators=300, max_depth=4, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.8, eval_metric="logloss",
        )
        # Platt scaling via sigmoid calibration
        clf = CalibratedClassifierCV(base, method="sigmoid", cv=3)
        clf.fit(X_tr, y_tr)

        acc = clf.score(X_te, y_te)
        log.info("Meta-model trained — out-of-sample accuracy: %.3f", acc)

        os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
        with open(MODEL_PATH, "wb") as f:
            pickle.dump(clf, f)
        self.model = clf


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    p = argparse.ArgumentParser()
    p.add_argument("--train", action="store_true")
    p.add_argument("--csv", default="data/training.csv")
    args = p.parse_args()
    if args.train:
        MetaLabeler(None).train(args.csv)
