/**
 * Ensemble Engine — adaptive weighted voting across ALL indicators.
 *
 * This is the answer to "why only SATS+Lore?" — here EVERY indicator votes,
 * and weights self-tune every 50 trades by each indicator's recent Sharpe.
 *
 * @module ensemble/ensembleEngine
 */
import { Candle, EnsembleResult, IndicatorVote, Direction } from '../types';
import { analyzeMacd } from '../indicators/macd';
import { analyzeIchimoku } from '../indicators/ichimoku';
import { analyzeRsiDivergence } from '../indicators/rsiDivergence';
import { analyzeVolumeProfile } from '../indicators/volumeProfile';
// NOTE: sats/lorentzian/squeeze/smc are refactored from your quadEngine.ts.
import { analyzeSats } from '../indicators/sats';
import { analyzeLorentzian } from '../indicators/lorentzian';
import { analyzeSqueeze } from '../indicators/squeeze';
import { analyzeSmc } from '../indicators/smc';

/** All indicator ids participating in the vote. */
export const INDICATOR_IDS = [
  'sats', 'lorentzian', 'squeeze', 'smc',
  'rsiDiv', 'ichimoku', 'macd', 'volumeProfile',
] as const;
export type IndicatorId = (typeof INDICATOR_IDS)[number];

/** Per-indicator realized R history (for Sharpe-based reweighting). */
type WeightState = {
  weights: Record<string, number>;
  rHistory: Record<string, number[]>; // last N realized R per indicator
};

function equalWeights(): Record<string, number> {
  const w: Record<string, number> = {};
  for (const id of INDICATOR_IDS) w[id] = 1 / INDICATOR_IDS.length;
  return w;
}

export function initWeightState(): WeightState {
  const rHistory: Record<string, number[]> = {};
  for (const id of INDICATOR_IDS) rHistory[id] = [];
  return { weights: equalWeights(), rHistory };
}

/** Sharpe ratio of a return series (0 if too few samples). */
function sharpe(rs: number[]): number {
  if (rs.length < 5) return 0;
  const mean = rs.reduce((a, v) => a + v, 0) / rs.length;
  const variance = rs.reduce((a, v) => a + (v - mean) ** 2, 0) / rs.length;
  const sd = Math.sqrt(variance);
  return sd === 0 ? 0 : mean / sd;
}

/**
 * Recalculate weights from each indicator's recent Sharpe.
 * Negative Sharpe → floored to a small epsilon so the indicator isn't fully muted.
 * Call this every `reweightEveryTrades` completed trades.
 */
export function recalcWeights(state: WeightState): void {
  const raw: Record<string, number> = {};
  let sum = 0;
  for (const id of INDICATOR_IDS) {
    const s = sharpe(state.rHistory[id].slice(-50));
    const score = Math.max(0.05, s + 1); // shift so floor is positive
    raw[id] = score;
    sum += score;
  }
  for (const id of INDICATOR_IDS) state.weights[id] = raw[id] / sum;
}

/** Record a trade's realized R against the indicators that voted for it. */
export function recordTradeOutcome(
  state: WeightState,
  votingIds: string[],
  realizedR: number
): void {
  for (const id of votingIds) {
    if (!state.rHistory[id]) state.rHistory[id] = [];
    state.rHistory[id].push(realizedR);
    if (state.rHistory[id].length > 200) state.rHistory[id].shift();
  }
}

/**
 * Run every indicator on the candles and produce an EnsembleResult for the
 * LAST bar (the live decision bar).
 */
export function runEnsemble(candles: Candle[], state: WeightState): EnsembleResult {
  const n = candles.length;
  const last = n - 1;

  const sats = analyzeSats(candles);
  const lore = analyzeLorentzian(candles);
  const sqz = analyzeSqueeze(candles);
  const smc = analyzeSmc(candles);
  const rsiDiv = analyzeRsiDivergence(candles);
  const ichi = analyzeIchimoku(candles);
  const macd = analyzeMacd(candles);
  const vp = analyzeVolumeProfile(candles);

  const price = candles[last].close;

  const votes: IndicatorVote[] = [
    {
      id: 'sats',
      vote: sats.stTrend[last] === 1 ? 1 : -1,
      strength: Math.min(1, sats.tqi[last] ?? 0.5),
    },
    {
      id: 'lorentzian',
      vote: lore.lorePrediction[last] > 0 ? 1 : lore.lorePrediction[last] < 0 ? -1 : 0,
      strength: Math.min(1, Math.abs(lore.lorePrediction[last]) / 8),
    },
    {
      id: 'squeeze',
      vote: sqz.sqzFiredBullish[last] ? 1 : sqz.sqzFiredBearish[last] ? -1 : (sqz.sqzVal[last] > 0 ? 1 : sqz.sqzVal[last] < 0 ? -1 : 0),
      strength: sqz.sqzFiredBullish[last] || sqz.sqzFiredBearish[last] ? 1 : 0.4,
    },
    {
      id: 'smc',
      vote: smc.swingTrend[last] === 1 ? 1 : smc.swingTrend[last] === -1 ? -1 : 0,
      strength: smc.bullishBOS[last] || smc.bearishBOS[last] ? 0.9 : 0.5,
    },
    {
      id: 'rsiDiv',
      // Source tracks regular + hidden divergence near the last pivot window
      vote: rsiDiv.regularBullish.slice(-3).some(Boolean) || rsiDiv.hiddenBullish.slice(-3).some(Boolean) ? 1
          : rsiDiv.regularBearish.slice(-3).some(Boolean) || rsiDiv.hiddenBearish.slice(-3).some(Boolean) ? -1 : 0,
      strength: rsiDiv.regularBullish.slice(-3).some(Boolean) || rsiDiv.regularBearish.slice(-3).some(Boolean) ? 0.8 : 0.5,
    },
    {
      id: 'ichimoku',
      // Gabremoku oscillator: force sign is the trend vote
      vote: ichi.force[last] > 0 ? 1 : ichi.force[last] < 0 ? -1 : 0,
      strength: Math.min(1, Math.abs(ichi.force[last]) / 100),
    },
    {
      id: 'macd',
      // Histogram sign + divergence/cross boost
      vote: macd.bullishDivergence.slice(-3).some(Boolean) ? 1
          : macd.bearishDivergence.slice(-3).some(Boolean) ? -1
          : macd.histogram[last] > 0 ? 1 : macd.histogram[last] < 0 ? -1 : 0,
      strength: macd.bullishDivergence.slice(-3).some(Boolean) || macd.bearishDivergence.slice(-3).some(Boolean) ? 0.9
              : macd.bullishCross[last] || macd.bearishCross[last] ? 0.85 : 0.45,
    },
    {
      id: 'volumeProfile',
      // Above POC = bullish bias (acceptance), below = bearish
      vote: price > vp.poc ? 1 : price < vp.poc ? -1 : 0,
      strength: price > vp.vah || price < vp.val ? 0.7 : 0.4,
    },
  ];

  // Weighted consensus score in [-1, +1]
  let weighted = 0;
  for (const v of votes) {
    const w = state.weights[v.id] ?? 1 / INDICATOR_IDS.length;
    weighted += w * v.vote * v.strength;
  }

  // Map [-1,+1] → [0,100]
  const signalStrength = Math.round(((weighted + 1) / 2) * 100);
  let direction: Direction = 'NEUTRAL';
  if (signalStrength >= 65) direction = 'BUY';
  else if (signalStrength <= 35) direction = 'SELL';

  return {
    index: last,
    time: candles[last].time,
    signalStrength,
    direction,
    votes,
    weights: { ...state.weights },
  };
}
