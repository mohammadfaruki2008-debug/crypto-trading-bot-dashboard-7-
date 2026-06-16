# Quad-Engine AI — Production Crypto Trading Bot

> ⚠️ **This is a REFERENCE backend codebase** meant to be deployed on your own
> server (Node.js + Python + PostgreSQL + Redis via Docker). It does **NOT** run
> inside the browser preview — it is a standalone multi-service system.

A multi-indicator ensemble trading bot that fuses **SATS SuperTrend**,
**Lorentzian Classification**, **Squeeze Momentum**, **Smart Money Concepts**,
**RSI Divergence**, **Ichimoku**, **MACD**, and **Volume Profile** with an
**adaptive weighted voting** engine and a **Python ML meta-layer**
(XGBoost meta-labeler + HMM regime detection), executing live on Binance Spot
with rigorous risk management.

---

## How signals work (the core question)

### Entry (BUY / SELL)
The **Ensemble Engine** collects a bullish/bearish vote from every indicator,
applies **adaptive weights** (re-tuned every 50 trades by each indicator's recent
Sharpe ratio), and produces a `signalStrength` score 0–100. A trade fires when:

```
signalStrength >= ENTRY_THRESHOLD (default 65)
AND ML confidence >= 0.6
AND risk filter passes (daily/weekly loss limits, correlation)
```

This is different from the old dashboard which only used **SATS + Lorentzian**.
Here ALL 8 indicators vote.

### Stop Loss (SL)
```
satsSL  = lastPivotLow − 1.5 × ATR        (structure based)
loreSL  = lorentzianKernel − 0.5 × ATR    (ML kernel based)
finalSL = max(satsSL, loreSL)             (the safer of the two)
```

### Entry price
`entry = close` of the bar where the ensemble signal confirms.

### Take Profit (TP1 / TP2 / TP3)
R-multiple based, scaled by Trend Quality (TQI) and ML confidence:
```
risk        = entry − finalSL
scale       = clamp(1.0 + 0.5×(confidence) + 0.3×TQI, 0.8, 2.0)
TP1 = entry + risk × 1.0 × scale   (33% position, then SL → breakeven)
TP2 = entry + risk × 2.0 × scale   (33% position, then SL → TP1, trail SuperTrend)
TP3 = entry + risk × 3.0 × scale   (34% position, full close)
```

### Trailing
- Price hits **+1R** → SL moves to **breakeven**
- Price hits **+2R** → SL trails the **SuperTrend line**

---

## Architecture

```
TradingView/Binance candles
        │
        ▼
┌─────────────────────────────────────────┐
│  8 Indicator Modules (TypeScript)        │
│  SATS · Lorentzian · Squeeze · SMC       │
│  RSI-Div · Ichimoku · MACD · VolProfile  │
└─────────────────┬───────────────────────┘
                  ▼
┌─────────────────────────────────────────┐
│  Ensemble Engine (adaptive weighted vote)│
│  → signalStrength 0-100, direction       │
└─────────────────┬───────────────────────┘
                  ▼
┌─────────────────────────────────────────┐
│  ML Service (Python FastAPI)             │
│  XGBoost meta-labeler → confidence       │
│  HMM → regime (Trending/Ranging/HighVol) │
└─────────────────┬───────────────────────┘
                  ▼
┌─────────────────────────────────────────┐
│  Risk Manager (1% sizing, loss limits)   │
└─────────────────┬───────────────────────┘
                  ▼
┌─────────────────────────────────────────┐
│  Execution (Binance OCO + trailing SL)   │
└─────────────────────────────────────────┘
```

---

## Quick start (your own server)

```bash
# 1. Set env vars
cp .env.example .env       # fill BINANCE_API_KEY, BINANCE_API_SECRET, ENCRYPTION_KEY, DATABASE_URL

# 2. Spin up everything (Node bot + Python ML + Postgres + Redis)
docker compose up -d --build

# 3. Train the ML models once (needs history in DB)
docker compose exec ml python model.py --train
docker compose exec ml python regime.py --train

# 4. Watch the logs
docker compose logs -f bot
```

Services:
| Service   | Port  | Purpose                          |
|-----------|-------|----------------------------------|
| bot       | 8080  | Node.js trading loop + dashboard |
| ml        | 8000  | Python FastAPI (predict/regime)  |
| postgres  | 5432  | Trades, equity curve, weights    |
| redis     | 6379  | Exchange-info cache, rate limit  |

---

## File map

```
src/
  indicators/   8 faithful Pine ports, each exports analyze()
  ensemble/     adaptive weighted voting
  ml/           HTTP client to the Python service
  execution/    Binance order + OCO manager
  risk/         position sizing + loss limits + correlation
  data/         candle fetcher (chunked, rate-limited)
  dashboard/    REST API for equity/trades/stats
  backtest/     walk-forward + Monte Carlo
  main.ts       the trading loop
  config.ts     all tunables + encrypted key loader
  types.ts      shared types
ml_service/
  main.py       FastAPI app
  model.py      XGBoost meta-labeler (Platt-calibrated)
  regime.py     HMM 3-state regime
```

See each file's JSDoc/docstring for details.
