# 🚀 Backend Deployment Guide — Render.com

## Required Environment Variables (Backend)

Render.com → Your Service → **Environment** tab → Add each variable:

### 🔴 REQUIRED — must add these

| Variable | Where to get it | Why needed |
|---|---|---|
| `GROQ_API_KEY` | [console.groq.com/keys](https://console.groq.com/keys) (free, 30s signup) | JARVIS AI brain |
| `BINANCE_API_KEY` | [Binance API Management](https://www.binance.com/en/my/settings/api-management) | Place trades, fetch portfolio |
| `BINANCE_SECRET` | Same page (shown once on creation) | API request signing |
| `ENCRYPTION_KEY` | Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Encrypt API keys at rest |
| `WEBHOOK_SECRET` | Any random string you choose | TradingView webhook auth |
| `FRONTEND_URL` | Your Netlify URL (e.g. `https://quantum-mind.netlify.app`) | CORS allowlist |

### 🟡 OPTIONAL — add if you want these features

| Variable | When you need it |
|---|---|
| `BINANCE_TESTNET=true` | For sandbox mode (no real money, get keys at [testnet.binance.vision](https://testnet.binance.vision)) |
| `SUPABASE_URL` | For RAG knowledge base / self-learning memory |
| `SUPABASE_ANON_KEY` | Same — pgvector for past trade memory |
| `EMAIL_ACCOUNT` | Gmail IMAP signal scraping (needs TV Pro+) |
| `EMAIL_PASSWORD` | Gmail 16-char App Password |
| `HF_TOKEN` | Alternative embeddings (Hugging Face) |

### 🟢 AUTO-SET by Render

| Variable | Source |
|---|---|
| `PORT` | Render injects `10000` automatically |
| `NODE_ENV` | Set to `production` automatically |

---

## 📤 Step-by-Step Render Deploy

### 1. Push backend folder to GitHub
```bash
cd jarvis-server
git init
git add .
git commit -m "Backend ready"
git remote add origin https://github.com/yourname/quantum-mind-backend.git
git push -u origin main
```

### 2. Create Render Web Service
1. [render.com](https://render.com) → **New** → **Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Name**: `quantum-mind-backend`
   - **Region**: closest to Binance servers (e.g. Singapore for AWS Tokyo Binance)
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node dist/server.js`
   - **Instance Type**: Free (or Starter $7/mo for 24/7 uptime)

### 3. Add Environment Variables
Click **Advanced** → **Add Environment Variable** for each REQUIRED var above.

### 4. Deploy!
Click **Create Web Service**. Wait ~3 minutes.
Your backend URL: `https://quantum-mind-backend.onrender.com`

### 5. Whitelist Render IP in Binance
1. Render → Your service → **Settings** → **Outbound IPs** (copy the IP)
2. Binance → API Management → Edit your key → **Restrict IP** → paste the Render IP

### 6. Connect Frontend to Backend
In your Netlify frontend, update `TradeJarvisFloating.tsx` mounting:
```tsx
<TradeJarvisFloating
  context={jarvisCtx}
  serverUrl="https://quantum-mind-backend.onrender.com"
/>
```

Or add to Netlify env: `VITE_API_URL=https://quantum-mind-backend.onrender.com`

---

## ⚠️ Render Free Tier Caveat

Free tier **sleeps after 15 min idle** (cold start ~30s on next request).
For 24/7 trading bot:
- Upgrade to **Starter ($7/mo)** — no sleep, always-on monitor
- Or use a keep-alive ping (cron job hitting `/api/jarvis/status` every 10 min)

---

## 🔒 Security Checklist Before Deploy

- ✅ Never commit `.env` to Git (already in `.gitignore`)
- ✅ Use Binance API key with **Spot Trading ON, Withdrawals OFF**
- ✅ Whitelist Render's outbound IP in Binance
- ✅ Use Testnet first (`BINANCE_TESTNET=true`) to verify everything works
- ✅ Rotate `ENCRYPTION_KEY` if ever exposed
- ✅ Set `FRONTEND_URL` to your exact Netlify domain (not `*`) for CORS

---

## 🧪 Test After Deploy

```bash
# Health check
curl https://quantum-mind-backend.onrender.com/api/jarvis/status

# Should return: { "monitor": {...}, "alerts": [...], "pendingCodeFix": null }
```

If you see the JSON response, **backend is live!** 🎉
