/**
 * Quantum Mind Backend — Express server entry (Monolithic Architecture).
 * Serves both the React Frontend UI and handles API/Trading logic under one roof.
 */
import express from 'express';
import cors from 'cors';
import path from 'path'; 
import dotenv from 'dotenv';

import config, { printBanner } from './config'; 
import dashboardRouter from './routes/dashboardRoutes';
import jarvisRouter from './routes/jarvisRoutes';
import settingsRouter from './routes/settingsRoutes';
import { startMonitor } from './lib/tools/monitor';

dotenv.config();

const app = express();
const PORT = config.port || process.env.PORT || 8080;

app.use(cors({
  origin: config.frontendUrl === '*' ? true : config.frontendUrl,
  credentials: true,
  exposedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '5mb' }));

// 📝 Simple request logger
app.use((req, _res, next) => {
  if (req.method !== 'GET') console.log(`[${req.method}] ${req.path}`);
  next();
});

/*
 * STATIC FILES PATH FIX:
 * When this code is compiled, server.js runs from backend/dist/.
 * So __dirname = '/opt/render/project/src/backend/dist/'.
 * To reach the project root's dist/ (where the frontend build lives),
 * we go up two levels: '..', '..' → '/opt/render/project/src/'
 * then 'dist' → '/opt/render/project/src/dist/'.
 */
app.use(express.static(path.join(__dirname, '..', '..', 'dist')));

// 🔌 API routes
app.use('/api', settingsRouter);
app.use('/api', dashboardRouter);
app.use('/api', jarvisRouter);

// 🩺 Health check (for UptimeRobot)
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime(), ts: Date.now() }));

// 🚀 Catch-all: serve index.html for SPA routing, but skip /api routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
});

// ❌ 404 & global error handler
app.use((_req, res) => res.status(404).json({ error: 'API route not found' }));
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ⚡ Start server and background monitor
const server = app.listen(PORT, () => {
  try {
    printBanner();
  } catch (e) {
    console.log(`🚀 Quantum Mind Monolith Engine Active`);
  }
  console.log(`✅ Monolith server successfully listening on port ${PORT}`);

  console.log('🤖 Starting background JARVIS trading monitor...');
  try {
    startMonitor();
  } catch (err: any) {
    console.error('[BOOT] Monitor auto-start failed:', err.message);
  }
});

// 🛑 Graceful shutdown
process.on('SIGTERM', () => { console.log('[SHUTDOWN] SIGTERM received.'); server.close(() => process.exit(0)); });
process.on('SIGINT', () => { console.log('[SHUTDOWN] SIGINT received.'); server.close(() => process.exit(0)); });
process.on('uncaughtException', (err) => console.error('[CRITICAL UNCAUGHT]', err));
process.on('unhandledRejection', (err) => console.error('[CRITICAL UNHANDLED]', err));
