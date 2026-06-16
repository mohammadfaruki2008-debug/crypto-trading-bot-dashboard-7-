# 🚀 Quantum Mind — Deployment Guide

## ⚠️ READ THIS FIRST — Honest Analysis

Your repository has **3 separate sub-projects** that are confusing the deployment:

```
/                          ← Vite React FRONTEND (this is what deploys)
├── package.json           ← Vite + React
├── src/                   ← Frontend code
├── index.html
│
├── jarvis-server/         ← Reference Express backend (DON'T deploy with frontend)
├── jarvis-backend/        ← Old duplicate (DELETE this folder)
└── quad-engine-ai/        ← Reference codebase for future use (DELETE or ignore)
```

**The fix: deploy ONLY the root as a Vite static site.** The nested folders confuse
Render because each has its own `package.json`.

---

## 🧹 Step 1: Clean Your GitHub Repo

In your local clone, run:

```bash
# Remove the duplicate/reference folders (they're confusing the deploy)
rm -rf jarvis-server/
rm -rf jarvis-backend/
rm -rf jarvis-server-ref/
rm -rf quad-engine-ai/

# Commit and push
git add -A
git commit -m "Clean: remove duplicate backend folders, keep frontend only"
git push origin main
```

**Note:** If you want to keep these folders as reference, move them OUT of the GitHub
repo to a separate folder on your local machine. They MUST NOT be in the deployed repo.

---

## 📦 Step 2: Verify Root `package.json`

Your root `package.json` should look like this (check it manually on GitHub):

```json
{
  "name": "quantum-mind",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "clsx": "2.1.1",
    "lucide-react": "^0.x",
    "react": "19.2.6",
    "react-dom": "19.2.6",
    "tailwind-merge": "3.4.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "4.1.17",
    "@types/node": "22.19.17",
    "@types/react": "19.2.7",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "5.1.1",
    "tailwindcss": "4.1.17",
    "typescript": "5.9.3",
    "vite": "7.3.2",
    "vite-plugin-singlefile": "2.3.0"
  }
}
```

**No `start` script needed** — this is a static site, no server runs on Render.

---

## 🌐 Step 3: Deploy on Render (Static Site)

### Option A: Manual Setup (Recommended for first deploy)

1. Go to [render.com](https://render.com) → **New** → **Static Site**
2. Connect your GitHub repo: `crypto-trading-bot-dashboard-7-`
3. Configure:

| Field | Value |
|---|---|
| **Name** | `quantum-mind` |
| **Branch** | `main` |
| **Root Directory** | *(leave EMPTY — use repo root)* |
| **Build Command** | `npm install && npm run build` |
| **Publish Directory** | `dist` |

4. Click **Advanced** → Add Environment Variable:

| Key | Value |
|---|---|
| `NODE_VERSION` | `22` |
| `NPM_CONFIG_PRODUCTION` | `false` |

5. Click **Create Static Site**
6. Wait ~3 minutes. Your URL: `https://quantum-mind.onrender.com`

### Option B: Using `render.yaml` (Blueprint)

`render.yaml` is already in your repo. On Render:
1. **New** → **Blueprint**
2. Select your repo → it auto-reads `render.yaml`
3. Click **Apply** — done!

---

## 🟢 Alternative: Deploy on Netlify (Faster, recommended)

Netlify is faster and free for static sites:

1. [netlify.com](https://netlify.com) → **Add new site** → **Import from Git**
2. Select your repo
3. Build settings (auto-detected from `netlify.toml`):
   - Build command: `npm install && npm run build`
   - Publish directory: `dist`
4. Click **Deploy site**
5. Live in ~2 minutes at `https://random-name.netlify.app`

You can rename the site later: Settings → Site information → Change site name.

---

## 🎯 Step 4: After Deploy — First-Time Setup

Once live, the user (you) does this in the browser:

1. Open the deployed URL (e.g. `https://quantum-mind.onrender.com`)
2. Login: `admin@example.com` / `changeme`
3. Go to **Binance API & Security** page
4. Enter your Binance API key + secret (stored encrypted in browser localStorage)
5. Click **Test Keys** → should show "Valid! Spot trading allowed"
6. Go to **Tradeable Coins** → add coins (BTCUSDT, ETHUSDT, etc.) with timeframes
7. Go to **Bot Settings** → toggle **Master Switch ON** + **Auto-Trade ON**
8. Open **Quantum Mind** chart → 8-engine analysis runs every 60s
9. Click the **🌀 JARVIS** floating button → ask "scan the markets" (text or voice)

---

## ✅ Pre-Push Checklist

Before `git push origin main`, verify:

- [ ] Only ONE `package.json` at repo root (no nested ones)
- [ ] `jarvis-server/`, `jarvis-backend/`, `quad-engine-ai/` removed
- [ ] `index.html` at repo root
- [ ] `src/` folder at repo root contains all React code
- [ ] `vite.config.ts` at repo root
- [ ] `netlify.toml` and/or `render.yaml` at repo root
- [ ] `.gitignore` excludes `node_modules/`, `dist/`, `.env`
- [ ] No `.env` file committed (only `.env.example`)
- [ ] `npm run build` succeeds locally
- [ ] `dist/index.html` is generated

---

## 🐛 Common Render Errors & Fixes

| Error | Fix |
|---|---|
| `Root directory "backend" does not exist` | Leave Root Directory **empty** in Render settings |
| `Cannot find module 'express'` | You're deploying as Web Service; switch to **Static Site** |
| `tsc: command not found` | Add `NPM_CONFIG_PRODUCTION=false` env var so devDependencies install |
| `error TS2688: Cannot find type 'node'` | Static site doesn't need `tsc`; only `vite build` runs |
| Build succeeds but page is blank | Check browser console; usually a missing env var or 404 on assets |
| `npm install` skips devDependencies | Set `NPM_CONFIG_PRODUCTION=false` in Render env vars |

---

## 🔮 Future: Backend Deploy (Optional)

If later you want 24/7 monitoring or server-side code injection,
deploy `jarvis-server/` as a **separate** Render Web Service:

1. Move `jarvis-server/` to its own GitHub repo
2. Render → New → Web Service → connect that repo
3. Set env vars: `GROQ_API_KEY`, `BINANCE_API_KEY`, `BINANCE_SECRET`, etc.
4. Update frontend to call your backend URL via `serverUrl` prop on
   `<TradeJarvisFloating />`

But for now, **the frontend-only deploy is fully functional** — JARVIS works via
Cloudflare Worker, trades execute via Binance browser API.

---

## 📊 Architecture Summary

```
Browser (User)
    ↓
Quantum Mind Frontend (Render Static Site / Netlify)
    ↓
    ├─→ Binance API (direct from browser, user's keys)
    ├─→ Cloudflare Worker (JARVIS AI brain — Groq/Gemini/SambaNova fallback)
    └─→ Web Speech API (voice control, Chrome/Edge only)
```

**No backend server required for normal operation.** Everything works client-side.

---

## 🎉 Final Summary

✅ Frontend builds clean
✅ `netlify.toml` and `render.yaml` configured
✅ `.env.example` documented
✅ Cloudflare Worker handles AI (no CORS, no exposed keys)
✅ Binance keys entered by user via Settings (browser-encrypted)
✅ Ready to deploy in 3 minutes

**Push to GitHub → Deploy → Done. 🚀**
