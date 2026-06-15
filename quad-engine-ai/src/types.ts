/**
 * Shared domain types for Quad-Engine AI.
 * @module types
 */

/** A single OHLCV candle. */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Direction enum used across indicators and the ensemble. */
export type Direction = 'BUY' | 'SELL' | 'NEUTRAL';

/** Generic per-indicator vote. */
export interface IndicatorVote {
  /** Indicator id, e.g. 'sats', 'lorentzian'. */
  id: string;
  /** -1 bearish, 0 neutral, +1 bullish. */
  vote: -1 | 0 | 1;
  /** Optional 0..1 conviction the indicator attaches to its own vote. */
  strength: number;
}

/** ===== SATS ===== */
export interface SATSResult {
  stLine: number[];
  stTrend: number[];
  tqi: number[];
  erValue: number[];
  atrValue: number[];
  lastPivotLow: (number | null)[];
  lastPivotHigh: (number | null)[];
  flipUp: boolean[];
  flipDown: boolean[];
  effectiveSlMult: number;
}

/** ===== Lorentzian ===== */
export interface LorentzianResult {
  lorePrediction: number[];
  loreSignal: number[];
  loreYhat1: number[];
  loreYhat2: number[];
  loreKernelBullish: boolean[];
  loreKernelBearish: boolean[];
  loreIsBuySignal: boolean[];
  loreIsSellSignal: boolean[];
  loreIsNewBuySignal: boolean[];
  loreIsNewSellSignal: boolean[];
}

/** ===== Squeeze ===== */
export interface SqueezeResult {
  sqzVal: number[];
  sqzOn: boolean[];
  sqzOff: boolean[];
  sqzFiredBullish: boolean[];
  sqzFiredBearish: boolean[];
}

/** ===== SMC ===== */
export interface SMCResult {
  swingTrend: number[];      // +1 bull, -1 bear
  internalTrend: number[];
  bullishBOS: boolean[];
  bearishBOS: boolean[];
  bullishCHoCH: boolean[];
  bearishCHoCH: boolean[];
  inBullishOB: boolean[];
  inBearishOB: boolean[];
}

/** ===== RSI Divergence ===== */
export interface RsiDivergenceResult {
  rsi: number[];
  regularBullish: boolean[];
  regularBearish: boolean[];
  hiddenBullish: boolean[];
  hiddenBearish: boolean[];
}

/** ===== Ichimoku ===== */
export interface IchimokuResult {
  tenkan: number[];
  kijun: number[];
  senkouA: number[];
  senkouB: number[];
  chikou: number[];
  tkCrossBull: boolean[];
  tkCrossBear: boolean[];
  kumoBreakoutBull: boolean[];
  kumoBreakoutBear: boolean[];
  priceAboveKumo: boolean[];
  priceBelowKumo: boolean[];
}

/** ===== MACD ===== */
export interface MacdResult {
  macd: number[];
  signal: number[];
  histogram: number[];
  bullishCross: boolean[];
  bearishCross: boolean[];
  bullishDivergence: boolean[];
  bearishDivergence: boolean[];
}

/** ===== Volume Profile ===== */
export interface VolumeProfileResult {
  poc: number;   // Point of Control
  vah: number;   // Value Area High
  val: number;   // Value Area Low
  bins: { price: number; volume: number }[];
}

/** ===== Ensemble ===== */
export interface EnsembleResult {
  index: number;
  time: number;
  signalStrength: number;          // 0..100
  direction: Direction;
  votes: IndicatorVote[];
  weights: Record<string, number>; // current adaptive weights
}

/** ===== ML ===== */
export interface MlPrediction {
  confidence: number;              // 0..1 probability TP1 before SL
  direction: Direction;
  regime: 'trending' | 'ranging' | 'high_vol';
}

/** ===== Trade ===== */
export interface TradePlan {
  symbol: string;
  direction: Direction;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskUsdt: number;
  qty: number;
  confFactor: number;
  tqi: number;
  signalStrength: number;
  mlConfidence: number;
  regime: string;
}

export interface OpenTrade extends TradePlan {
  id: string;
  status: 'open' | 'closed_tp' | 'closed_sl' | 'closed_manual';
  buyOrderId: number;
  slOrderId: number | null;
  tp1OrderId: number | null;
  tp2OrderId: number | null;
  tp3OrderId: number | null;
  tp1Filled: boolean;
  tp2Filled: boolean;
  tp3Filled: boolean;
  slMovedToBreakeven: boolean;
  slTrailingSuperTrend: boolean;
  openedAt: string;
  closedAt?: string;
  realizedR?: number;
  pnlUsdt?: number;
}

/** Account/risk snapshot. */
export interface AccountState {
  equityUsdt: number;
  dayStartEquity: number;
  weekStartEquity: number;
  peakEquity: number;
  openTrades: OpenTrade[];
  tradingHalted: boolean;
  haltReason?: string;
}
