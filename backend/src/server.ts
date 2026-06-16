/**
 * Quantum Mind Backend — Express server entry.
 * Auto-starts the 24/7 autonomous monitor on boot.
 */
import express from 'express';
import cors from 'cors';
import { config, printBanner } from './config';
import { jarvisRouter } from './routes/jarvisRoutes';
import { dashboardRouter } from './routes/dashboardRoutes';
import { settingsRouter } from './routes/settingsRoutes';
import { startMonitor } from './lib/tools/monitor';
// Import jarvisBrain to wire the monitor → JARVIS callback
import './lib/jarvisBrain';

const app = express();

// CORS — strict to the configured frontend URL in production
app.use(cors({
  origin: config.frontendUrl === '*' ? true : config.frontendUrl,
  credentials: true,
  exposedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '5mb' }));

app.use((req, _res, next) => {
  if (req.method !== 'GET') console.log(`[${req.method}] ${req.path}`);
  next();
});

app.get('/', (_req, res) => res.json({
  name: 'Quantum Mind Backend',
  version: '2.0.0',
  status: 'online',
  endpoints: {
    public: ['GET /health', 'GET /api/price/:symbol', 'GET /api/candles/:symbol', 'GET /api/analysis/:symbol', 'GET /api/jarvis-status'],
    protected: [
      'GET /api/settings/status', 'POST /api/settings/save', 'POST /api/settings/test', 'DELETE /api/settings',
      'POST /api/jarvis-ask', 'POST /api/jarvis-approve',
      'POST /api/trade', 'POST /api/emergency-stop',
      'GET /api/portfolio', 'GET /api/trades', 'GET /api/stats',
      'POST /api/alerts', 'GET /api/alerts', 'DELETE /api/alerts/:id',
      'POST /api/monitor-start', 'POST /api/monitor-stop',
    ],
  },
}));

app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime(), ts: Date.now() }));

// Mount routes
app.use('/api', settingsRouter);
app.use('/api', dashboardRouter);
app.use('/api', jarvisRouter);

// 404 + error
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[SERVER]', err);
  res.status(500).json({ error: err.message || 'Internal error' });
});

const server = app.listen(config.port, () => {
  printBanner();
  console.log(`✅ Listening on port ${config.port}`);

  // 🔑 The crucial 24/7 monitor auto-start
  if (config.monitor.autoStart) {
    console.log('🤖 Auto-starting 24/7 JARVIS monitor in 2s...');
    setTimeout(() => {
      try {
        startMonitor(config.monitor.symbols);
      } catch (err: any) {
        console.error('[BOOT] monitor auto-start failed:', err.message);
      }
    }, 2000);
  } else {
    console.log('⚪ MONITOR_AUTOSTART is false. Use POST /api/monitor-start to start.');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => { console.log('[SHUTDOWN] SIGTERM'); server.close(() => process.exit(0)); });
process.on('SIGINT', () => { console.log('[SHUTDOWN] SIGINT'); server.close(() => process.exit(0)); });
process.on('uncaughtException', (err) => console.error('[UNCAUGHT]', err));
process.on('unhandledRejection', (err) => console.error('[UNHANDLED]', err));
