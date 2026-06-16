# 🚀 Quantum Mind Backend — Render.com Deployment Guide

## What this backend does (24/7)

✅ **Real Binance Spot trading** — signed market BUY orders, OCO (3 TPs + SL)
✅ **Autonomous monitor** — scans coins every 15min, JARVIS decides trades
✅ **Price alerts** — checked continuously, triggered when crossed
✅ **Risk management** — 1% per trade, daily loss limit, 2h cooldown, max 5 open
✅ **Emergency stop** — cancels all orders, market-sells all holdings
✅ **JARVIS AI brain** — Cloudflare Worker proxy (Groq/Gemini/SambaNova fallback)
✅ **Code modification** — staged file writes with approval
✅ **Self-learning memory** — Supabase pgvector OR local JSON fallback
✅ **Backtesting** — real historical klines, vectorized simulation
✅ **Portfolio tracking** — real account balances, open orders, daily PnL
✅ **Webhook receiver** — TradingView alerts via POST /api/webhook

---

## ⚠️ MUST BE A PAID PLAN

Render **free tier sleeps after 15 min idle** — your 24/7 monitor will STOP working.

**Use Starter plan: $7/month** for always-on monitoring.

---

## 📤 Step-by-Step Deploy

### 1. Push backend to GitHub

```bash
# From your project root
cd backend
git init
git add .
git commit -m "Backend ready"

# Either push as separate repo:
git remote add origin https://github.com/yourname/quantum-mind-backend.git
git push -u origin main

# OR keep in same repo as frontend (backend/ subfolder)
cd ..
git add backend/
git commit -m "Add backend"
git push origin main
```

### 2. Create Render Web Service

1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect your GitHub repo
3. **Settings:**

| Field | Value |
|---|---|
| **Name** | `quantum-mind-backend` |
| **Region** | Singapore (closest to Binance Asia servers) |
| **Branch** | `main` |
| **Root Directory** | `backend` *(if backend is a subfolder)*  OR leave empty *(if separate repo)* |
| **Runtime** | Node |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |
| **Instance Type** | **Starter ($7/mo)** — REQUIRED for 24/7 |

### 3. Environment Variables

Click **Advanced** → **Add Environment Variable** for each:

| Key | Value | Required |
|---|---|---|
| `NODE_VERSION` | `22` | ✅ |
| `NPM_CONFIG_PRODUCTION` | `false` | ✅ |
| `BINANCE_API_KEY` | (your key) | ✅ |
| `BINANCE_SECRET` | (your secret) | ✅ |
| `BINANCE_TESTNET` | `true` (start with testnet!) | ✅ |
| `WEBHOOK_SECRET` | (random string) | ✅ |
| `ADMIN_TOKEN` | (random string) | ✅ |
| `FRONTEND_URL` | `https://your-app.netlify.app` | ✅ |
| `MONITOR_SYMBOLS` | `BTCUSDT,ETHUSDT,SOLUSDT` | ✅ |
| `MONITOR_INTERVAL_MIN` | `15` | ✅ |
| `MONITOR_AUTOSTART` | `true` | ✅ |
| `JARVIS_WORKER_URL` | `https://quantum-mind.mohammadfaruki2008.workers.dev/` | ✅ |
| `SUPABASE_URL` | (your project URL) | Optional |
| `SUPABASE_ANON_KEY` | (your anon key) | Optional |

### 4. Click **Create Web Service**

Wait ~3 minutes. Watch the logs.

You should see:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 Quantum Mind Backend
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Env:            production
Port:           10000
Binance mode:   🧪 TESTNET
Binance keys:   ✅ set
Monitor:        BTCUSDT, ETHUSDT, SOLUSDT every 15min
Auto-start:     ✅ yes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Server listening on port 10000
🤖 Auto-starting JARVIS autonomous monitor...
[MONITOR] 🚀 Starting on BTCUSDT, ETHUSDT, SOLUSDT every 15min
[MONITOR] 🔄 Tick #1 @ 2025-01-15T12:00:00.000Z
```

### 5. Test the deploy

```bash
# Replace with your Render URL
curl https://quantum-mind-backend.onrender.com/health
# → {"status":"ok","uptime":12.3,"ts":...}

curl https://quantum-mind-backend.onrender.com/api/jarvis/status
# → {"monitor":{"running":true,...},"alerts":[],"pendingCodeFix":null}
```

### 6. Whitelist Render IP in Binance

1. Render dashboard → your service → **Settings** → scroll to **Outbound IPs**
2. Copy the IPs (usually 2)
3. Go to [Binance API Management](https://www.binance.com/en/my/settings/api-management)
4. Edit your API key → **Restrict access to trusted IPs only** → paste Render IPs

---

## 🔗 Connect Frontend to Backend

### On Netlify (your frontend):

1. Site → **Site configuration** → **Environment variables**
2. Add: `VITE_BACKEND_URL` = `https://quantum-mind-backend.onrender.com`
3. **Redeploy** the site (Deploys → Trigger deploy)

The JARVIS chat will now use your backend instead of the local browser brain.

---

## 🧪 Test the Full System

After both are deployed:

1. Open your Netlify URL
2. Login to dashboard
3. Click 🌀 JARVIS button
4. Say: *"check my portfolio"*
   - JARVIS calls backend → backend calls Binance → real balance returned
5. Say: *"buy 50 USDT of BTC"*
   - JARVIS warns, asks confirmation, then places real testnet order
6. Say: *"start monitoring BTC, ETH, SOL"*
   - 24/7 autonomous loop activates
7. Say: *"emergency stop"*
   - All positions market-sold, monitor halted

---

## 🔍 Monitor Render Logs

Render dashboard → your service → **Logs** tab.

Watch for:
- `[MONITOR] 🔄 Tick #N` every 15 min (proof of 24/7 operation)
- `[JARVIS] 🔧 tool_name: result` (every tool call)
- `[MONITOR] ✅ symbol trade executed` (autonomous trades)
- `[MONITOR] 🔔 Alert: symbol HIT` (price alert triggers)

---

## ⚠️ Production Switch (Mainnet)

**Only after testing thoroughly on testnet:**

1. Render env vars → change `BINANCE_TESTNET` to `false`
2. Update `BINANCE_API_KEY` + `BINANCE_SECRET` to mainnet keys
3. On Binance: enable Spot Trading, DISABLE withdrawals, IP-whitelist Render
4. Click **Manual Deploy** → **Deploy latest commit**
5. Monitor logs closely for first 30 mins

---

## 🐛 Common Issues

| Error | Fix |
|---|---|
| `Root directory "backend" does not exist` | Match Render setting to actual folder name |
| `Cannot find type 'node'` | Set `NPM_CONFIG_PRODUCTION=false` |
| `Binance error -2014` | Wrong API secret |
| `Binance error -2015` | Invalid key OR IP not whitelisted |
| `Monitor not running` | Check `MONITOR_AUTOSTART=true` is set |
| Worker timeout | Cloudflare Worker down — JARVIS falls back gracefully |
| Free tier sleeping | Upgrade to Starter $7/mo — REQUIRED for 24/7 |

---

## ✅ Pre-Deploy Checklist

- [ ] Binance API keys created (Spot ✅, Withdraw ❌)
- [ ] Testnet keys ready (from testnet.binance.vision)
- [ ] Render account created
- [ ] GitHub repo pushed with backend/ folder
- [ ] All env vars copied
- [ ] FRONTEND_URL set to your Netlify domain
- [ ] Plan upgraded to Starter ($7/mo)
- [ ] Render outbound IPs whitelisted in Binance
- [ ] First deploy tested with testnet
