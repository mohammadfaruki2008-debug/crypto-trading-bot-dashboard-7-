"""
Quad-Engine AI — ML microservice (FastAPI).

Endpoints:
  POST /predict   → meta-labeler confidence + regime
  GET  /health    → liveness

The meta-labeler (XGBoost, Platt-calibrated) estimates P(TP1 before SL).
The regime model (HMM, 3 states) labels Trending / Ranging / High-Vol.
"""
from __future__ import annotations

import logging
from typing import List

from fastapi import FastAPI
from pydantic import BaseModel

from model import MetaLabeler
from regime import RegimeDetector

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ml_service")

app = FastAPI(title="Quad-Engine AI ML Service", version="1.0.0")

meta = MetaLabeler.load_or_new()
regime = RegimeDetector.load_or_new()


class PredictRequest(BaseModel):
    """Feature vector — order must match mlClient.buildFeatures()."""
    features: List[float]


class PredictResponse(BaseModel):
    confidence: float
    direction: str
    regime: str


@app.get("/health")
def health() -> dict:
    """Liveness probe."""
    return {"status": "ok", "meta_trained": meta.is_trained, "regime_trained": regime.is_trained}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    """Return calibrated confidence + market regime for a feature vector."""
    conf = meta.predict_proba(req.features)
    reg = regime.predict(req.features)
    direction = "BUY" if conf >= 0.6 else ("SELL" if conf <= 0.4 else "NEUTRAL")
    log.info("predict conf=%.3f regime=%s", conf, reg)
    return PredictResponse(confidence=conf, direction=direction, regime=reg)
