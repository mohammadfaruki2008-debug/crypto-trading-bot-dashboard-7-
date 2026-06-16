# Backend Deploy — Render Web Service

## Prerequisites
- GitHub account
- Render account → must upgrade backend to **Starter ($7/mo)** for 24/7 uptime
- Binance API key + secret (start with **testnet**: testnet.binance.vision, login with GitHub)

## Steps

### 1. Push to GitHub
The `backend/` folder must be in your repo at the root.

### 2. Create Render Web Service
- Render → **New** → **Web Service** → connect repo
- **Root Directory**: `backend`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Region**: Singapore (closest to Binance Tokyo)
- **Instance Type**: ⚠️ **Starter ($7/mo)** — required for 24/7 monitor
- **Health Check Path**: `/health`

### 3. Set Environment Variables
| Key | Value |
|---|---|
| `NODE_VERSION` | `22` |
| `NPM_CONFIG_PRODUCTION` | `false` |
| `BINANCE_API_KEY` | (your key) |
| `BINANCE_SECRET_KEY` | (your secret) |
| `BINANCE_TESTNET` | `true` |
| `ADMIN_TOKEN` | (Render → Generate Value) |
| `WEBHOOK_SECRET` | (Render → Generate Value) |
| `FRONTEND_URL` | `https://your-frontend.onrender.com` |
| `JARVIS_WORKER_URL` | `https://quantum-mind.mohammadfaruki2008.workers.dev/` |
| `MONITOR_SYMBOLS` | `BTCUSDT,ETHUSDT,SOLUSDT` |
| `MONITOR_INTERVAL_SEC` | `60` |
| `MONITOR_AUTOSTART` | `true` |
| `SUPABASE_URL` | (optional) |
| `SUPABASE_ANON_KEY` | (optional) |

### 4. Deploy
Click **Create Web Service**. Watch logs — you should see:
```
🧠 QUANTUM MIND BACKEND v2.0
Binance keys:  ✅ configured
✅ Listening on port 10000
🤖 Auto-starting 24/7 JARVIS monitor in 2s...
[MONITOR] 🚀 Starting on BTCUSDT, ETHUSDT, SOLUSDT every 60s
[MONITOR] 🔄 Tick #1 @ ...
```

### 5. Whitelist Render IPs in Binance
- Render → your service → **Settings** → **Outbound IPs** (copy them)
- Binance → API Management → Edit Key → **Restrict access to trusted IPs only** → paste

### 6. Test
```bash
curl https://your-backend.onrender.com/health
# → {"status":"ok"}

curl https://your-backend.onrender.com/api/jarvis-status
# → {"monitor":{"running":true,"tickCount":N,...}}
```

### 7. Connect Frontend
On your frontend Render service, set:
- `VITE_BACKEND_URL` = `https://your-backend.onrender.com`
- `VITE_ADMIN_TOKEN` = same value as backend's `ADMIN_TOKEN`

Redeploy the frontend. Done.

## Switching to Mainnet

After thorough testnet testing:
1. Backend env → change `BINANCE_TESTNET` to `false`
2. Replace `BINANCE_API_KEY` + `BINANCE_SECRET_KEY` with real keys
3. On Binance API key: enable Spot Trading, **DISABLE withdrawals**, whitelist Render IPs
4. Manual Deploy → Deploy latest commit
5. Watch first 30 minutes closely
