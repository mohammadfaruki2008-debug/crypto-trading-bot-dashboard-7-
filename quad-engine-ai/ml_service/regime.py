"""
Regime detector — Gaussian HMM (3 states): Trending / Ranging / High-Vol.

Features used: ADX, realized volatility, efficiency ratio.
States are mapped to human labels by inspecting per-state means after fit.

Usage:
    python regime.py --train     # retrain from data/regime_features.csv
"""
from __future__ import annotations

import argparse
import logging
import os
import pickle
from typing import List

import numpy as np

log = logging.getLogger("regime")

REGIME_PATH = os.getenv("REGIME_MODEL_PATH", "data/regime_model.pkl")
LABELS = ["ranging", "trending", "high_vol"]


class RegimeDetector:
    """3-state Gaussian HMM over [adx, volatility, efficiency_ratio]."""

    def __init__(self, model=None, state_map=None) -> None:
        self.model = model
        # maps HMM state index → human label
        self.state_map = state_map or {0: "ranging", 1: "trending", 2: "high_vol"}

    @property
    def is_trained(self) -> bool:
        return self.model is not None

    @classmethod
    def load_or_new(cls) -> "RegimeDetector":
        if os.path.exists(REGIME_PATH):
            with open(REGIME_PATH, "rb") as f:
                m, sm = pickle.load(f)
                return cls(m, sm)
        log.warning("No trained regime model — defaulting to 'ranging'.")
        return cls(None)

    def _extract(self, features: List[float]) -> np.ndarray:
        """Pull [efficiency_ratio, atr_pct] proxies from the shared feature vector.
        Feature order (mlClient): [0]=signal,[1]=tqi,[2]=ER,[3]=atr_pct,[4]=rsi,...
        We approximate ADX with tqi, volatility with atr_pct, ER with ER.
        """
        tqi = features[1] if len(features) > 1 else 0.5
        atr_pct = features[3] if len(features) > 3 else 0.01
        er = features[2] if len(features) > 2 else 0.0
        return np.array([[tqi, atr_pct, er]])

    def predict(self, features: List[float]) -> str:
        """Return regime label for a single feature vector."""
        if self.model is None:
            # Rule-based fallback if HMM not trained
            atr_pct = features[3] if len(features) > 3 else 0.01
            er = features[2] if len(features) > 2 else 0.0
            if atr_pct > 0.03:
                return "high_vol"
            return "trending" if er > 0.4 else "ranging"
        x = self._extract(features)
        state = int(self.model.predict(x)[0])
        return self.state_map.get(state, "ranging")

    def train(self, csv_path: str = "data/regime_features.csv") -> None:
        """Fit HMM and map states to labels by their volatility/ER means."""
        import pandas as pd
        from hmmlearn.hmm import GaussianHMM

        df = pd.read_csv(csv_path)  # columns: adx, volatility, efficiency_ratio
        X = df[["adx", "volatility", "efficiency_ratio"]].values

        model = GaussianHMM(n_components=3, covariance_type="diag", n_iter=200, random_state=42)
        model.fit(X)

        # Map states: highest volatility mean → high_vol, highest ER → trending, rest → ranging
        means = model.means_  # shape (3, 3) → [adx, vol, er]
        vol_state = int(np.argmax(means[:, 1]))
        er_state = int(np.argmax(means[:, 2]))
        state_map = {}
        for s in range(3):
            if s == vol_state:
                state_map[s] = "high_vol"
            elif s == er_state:
                state_map[s] = "trending"
            else:
                state_map[s] = "ranging"

        os.makedirs(os.path.dirname(REGIME_PATH), exist_ok=True)
        with open(REGIME_PATH, "wb") as f:
            pickle.dump((model, state_map), f)
        log.info("Regime HMM trained. State map: %s", state_map)
        self.model = model
        self.state_map = state_map


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    p = argparse.ArgumentParser()
    p.add_argument("--train", action="store_true")
    p.add_argument("--csv", default="data/regime_features.csv")
    args = p.parse_args()
    if args.train:
        RegimeDetector(None).train(args.csv)
