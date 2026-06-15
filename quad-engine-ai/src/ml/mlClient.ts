/**
 * ML client — talks to the Python FastAPI service for confidence + regime.
 * @module ml/mlClient
 */
import { MlPrediction, EnsembleResult, SATSResult } from '../types';
import { config } from '../config';

/**
 * Build the feature vector the Python model expects.
 * Keep this in sync with ml_service/model.py FEATURE_ORDER.
 */
export function buildFeatures(
  ens: EnsembleResult,
  sats: SATSResult,
  extra: { atrPct: number; rsi: number; macdHist: number; volRatio: number }
): number[] {
  const i = ens.index;
  return [
    ens.signalStrength / 100,
    sats.tqi[i] ?? 0.5,
    sats.erValue[i] ?? 0,
    extra.atrPct,
    extra.rsi / 100,
    extra.macdHist,
    extra.volRatio,
    ...Object.values(ens.weights), // 8 adaptive weights
  ];
}

/**
 * Query the ML service. Falls back to ensemble-only confidence on error so the
 * bot keeps running even if the Python service is down.
 */
export async function getMlPrediction(features: number[]): Promise<MlPrediction> {
  try {
    const res = await fetch(`${config.ml.serviceUrl}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`ML HTTP ${res.status}`);
    return (await res.json()) as MlPrediction;
  } catch {
    // Fallback: derive a weak confidence from signal strength only
    const strength = features[0]; // signalStrength/100
    return {
      confidence: Math.max(0.4, strength),
      direction: strength >= 0.65 ? 'BUY' : strength <= 0.35 ? 'SELL' : 'NEUTRAL',
      regime: 'ranging',
    };
  }
}
