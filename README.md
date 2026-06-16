# 🧠 Quantum Mind — Secure Full-Stack AI Crypto Trading

A production-ready full-stack architecture where the **backend** is the single source of truth for trading and JARVIS lives there 24/7. The **frontend** is a clean display layer that never sees Binance keys.

```
┌──────────────────────────────────────────────────────────────────┐
│  USER BROWSER                                                    │
│  Frontend (Vite + React) deployed as Render Static Site          │
│  - Reads: VITE_BACKEND_URL, VITE_ADMIN_TOKEN                     │
│  - NEVER stores Binance keys                                     │
│  - Calls backend over HTTPS with X-Admin-Token header            │
└─────────────────────────┬────────────────────────────────────────┘
                          │ HTTPS + X-Admin-Token
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│  BACKEND (Node + Express) — Render Web Service (Starter $7/mo)   │
│  - Reads: BINANCE_*, ADMIN_TOKEN, SUPABASE_*, JARVIS_WORKER_URL  │
│  - Auto-starts 24/7 monitor on boot (setInterval every 60s)      │
│  - Holds Binance keys, signs all REST requests                   │
│  - JARVIS brain calls Cloudflare Worker for LLM                  │
│  - File storage in data/ folder OR Supabase pgvector             │
└─────────────────────────┬────────────────────────────────────────┘
                          │
            ┌─────────────┼─────────────────┐
            ▼             ▼                 ▼
     ┌──────────┐  ┌──────────────┐  ┌────────────┐
     │ Binance  │  │ Cloudflare   │  │  Supabase  │
     │ Spot API │  │ Worker (AI)  │  │  pgvector  │
     └──────────┘  └──────────────┘  └────────────┘
```

## 🔐 Security Properties

✅ **No client-side Binance keys** — all signed requests happen server-side
✅ **No browser-side trade logic** — `POST /api/trade` does the work
✅ **Admin token gating** — every mutating endpoint requires `X-Admin-Token`
✅ **24/7 monitor lives on the server** — runs even when no one is logged in
✅ **CORS strict** — backend only accepts requests from your frontend URL

## 📁 Repository Layout

```
.
├── render.yaml              ← Deploys BOTH frontend + backend in one click
├── README.md                ← This file
│
├── frontend/                ← Render Static Site
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── netlify.toml         (optional alt deploy target)
│   └── src/
│       ├── App.tsx
│       ├── components/      (Dashboard, JARVIS widget, charts...)
│       └── lib/
│           ├── backendApi.ts   ← Calls the secure backend
│           ├── quadEngine.ts   (client-side preview indicators only)
│           └── ...
│
└── backend/                 ← Render Web Service (Starter $7/mo for 24/7)
    ├── package.json
    ├── tsconfig.json
    ├── .env.example
    ├── DEPLOY.md
    └── src/
        ├── server.ts        ← Express entry, auto-starts monitor
        ├── config.ts        ← All env vars
        ├── middleware/
        │   └── auth.ts      ← X-Admin-Token middleware
        ├── routes/
        │   ├── dashboardRoutes.ts  (portfolio, trades, alerts, trade exec)
        │   └── jarvisRoutes.ts     (chat, approve, monitor control)
        └── lib/
            ├── binance.ts        ← HMAC-SHA256 signed orders (server only)
            ├── indicators.ts     ← RSI, MACD, SuperTrend on real klines
            ├── jarvisBrain.ts    ← Cloudflare Worker proxy + tool loop
            ├── knowledgeEngine.ts (Supabase pgvector or local JSON)
            ├── supabaseClient.ts
            ├── storage.ts
            └── tools/
                ├── trade.ts      ← executeTrade with risk mgmt + OCO
                ├── portfolio.ts  ← Real balances
                ├── alert.ts      ← Price alerts (checked every tick)
                ├── monitor.ts    ← ⭐ 24/7 setInterval — the heart of the bot
                ├── emergency.ts  ← Cancel all + market-sell + halt
                ├── codeFix.ts    ← Staged file writes + approval
                └── backtest.ts   ← Real historical klines simulation
```

## 🚀 Deploy

### Step 1 — push this repo to GitHub

Make sure `frontend/` and `backend/` are both in the same repo at the root.

### Step 2 — Render Blueprint (one click for both services)

1. Render → **New** → **Blueprint**
2. Connect the repo. Render reads `render.yaml` and creates both services.
3. After backend is created, go to its **Settings** → copy its public URL (e.g. `https://quantum-mind-backend.onrender.com`).
4. Go to the frontend service → **Environment** → set:
   - `VITE_BACKEND_URL` = the backend URL above
   - `VITE_ADMIN_TOKEN` = the same value as the backend's `ADMIN_TOKEN`
5. Set backend env vars (see `backend/.env.example`):
   - `BINANCE_API_KEY`, `BINANCE_SECRET_KEY` (start with `BINANCE_TESTNET=true`)
   - `FRONTEND_URL` = the frontend URL
6. Both services redeploy automatically. Done.

### Step 3 — verify

```bash
# Backend health
curl https://quantum-mind-backend.onrender.com/health
# → {"status":"ok","uptime":...}

# Backend monitor status (public)
curl https://quantum-mind-backend.onrender.com/api/jarvis-status
# → {"monitor":{"running":true,"tickCount":1,...}}
```

Open the frontend URL → login → click 🧠 JARVIS → say "what's my portfolio" → JARVIS calls backend → backend calls Binance → real balance returned.

## 🔍 Render Logs Show 24/7 Operation

```
🧠 QUANTUM MIND BACKEND v2.0
Binance:       🧪 TESTNET
Auto-start:    ✅
✅ Listening on port 10000
🤖 Auto-starting 24/7 JARVIS monitor in 2s...
[MONITOR] 🚀 Starting on BTCUSDT, ETHUSDT, SOLUSDT every 60s
[MONITOR] 🔄 Tick #1 @ 2025-01-15T12:00:00.000Z
[MONITOR] ⚪ BTCUSDT: HOLD — RSI 52, no clear signal
[MONITOR] ⚪ ETHUSDT: HOLD
[MONITOR] ⚪ SOLUSDT: HOLD
[MONITOR] ✅ Tick #1 done. Next in 60s.
... (continues forever, 24/7)
```

## ⚠️ Critical Notes

- **Render Starter plan ($7/mo) is REQUIRED for the backend.** Free tier sleeps after 15min idle and your monitor dies.
- **Whitelist Render outbound IPs in Binance:** Render Settings → Outbound IPs → paste into Binance API Management.
- **Start in TESTNET** (`BINANCE_TESTNET=true`) until you've verified everything end-to-end.
- **Browser does NOT need Binance keys anymore.** The "Binance API & Security" page in the frontend now just calls `GET /api/validate-binance` on the backend to verify the keys configured server-side.

See `backend/DEPLOY.md` for the full step-by-step Render guide.
