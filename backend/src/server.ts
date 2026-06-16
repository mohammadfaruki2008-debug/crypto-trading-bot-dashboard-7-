/**
 * Quantum Mind Backend — Express server entry point.
 * Auto-starts the 24/7 autonomous monitor on boot.
 */
import express from 'express';
import cors from 'cors';
import { config, logConfig } from './config';
import { jarvisRouter } from './routes/jarvisRoutes';
import { dashboardRouter } from './routes/dashboardRoutes';
import { startMonitor } from './lib/tools/monitor';

// Import jarvisBrain so the monitor → JARVIS callback gets wired
import './lib/jarvisBrain';

const app = express();

// CORS
app.use(cors({
  origin: config.frontendUrl === '*' ? true : config.frontendUrl,
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));

// Request logging
app.use((req, _res, next) => {
  if (req.method !== 'GET') console.log(`[${req.method}] ${req.path}`);
  next();
});

// Root
app.get('/', (_req, res) => {
  res.json({
    name: 'Quantum Mind Backend',
    version: '1.0.0',
    status: 'online',
    endpoints: {
      health: 'GET /health',
      dashboard: 'GET /api/health, /api/portfolio, /api/trades, /api/stats, /api/price/:symbol, /api/analysis/:symbol',
      jarvis: 'POST /api/jarvis, /api/jarvis/approve, GET /api/jarvis/status',
      monitor: 'POST /api/jarvis/monitor/start, /api/jarvis/monitor/stop',
    },
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), ts: Date.now() });
});

// Mount routers
app.use('/api', dashboardRouter);
app.use('/api', jarvisRouter);

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start server
const server = app.listen(config.port, () => {
  logConfig();
  console.log(`✅ Server listening on port ${config.port}`);
  console.log(`📡 CORS origin: ${config.frontendUrl}`);

  // Auto-start the 24/7 monitor
  if (config.monitor.autoStart) {
    console.log(`🤖 Auto-starting JARVIS autonomous monitor...`);
    setTimeout(() => {
      try {
        startMonitor(config.monitor.symbols);
      } catch (err: any) {
        console.error('[MONITOR] Auto-start failed:', err.message);
      }
    }, 2000); // 2s delay to let server fully boot
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] SIGTERM received, closing...');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('[SHUTDOWN] SIGINT received, closing...');
  server.close(() => process.exit(0));
});

// Don't crash on unhandled errors
process.on('uncaughtException', (err) => console.error('[UNCAUGHT]', err));
process.on('unhandledRejection', (err) => console.error('[UNHANDLED REJECTION]', err));
