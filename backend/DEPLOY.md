# Backend Deployment Guide (Render.com)

This backend is designed to run 24/7 on Render and securely handle all trading logic, API keys, and AI integration.

## Prerequisites
1. A Supabase project setup with the `supabase-schema.sql` executed.
2. An encryption key generated (64 hex chars).
   ```bash
   # Run this in your terminal to generate the key:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

## Deployment Steps

1. Push this code to your GitHub Repository.
2. Go to [Render.com](https://render.com/) and create a new **Web Service**.
3. Connect your GitHub repository.
4. Configure the settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
5. Add the following **Environment Variables**:
   - `ADMIN_TOKEN`: A random string to secure your API.
   - `SUPABASE_URL`: Your Supabase project URL.
   - `SUPABASE_ANON_KEY`: Your Supabase anon key.
   - `SECRET_ENCRYPTION_KEY`: The 64-char hex string you generated.
6. Click **Create Web Service**.

Once deployed, the 24/7 monitor will start automatically as soon as you save your Binance API keys via the frontend UI.
