/**
 * Quantum Mind Backend — Express server entry point.
 * Mounts JARVIS routes and serves the API on the port Render provides.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { jarvisRouter } from './routes/jarvisRoutes';

const app = express();

// CORS — allow your Netlify frontend (or all origins if FRONTEND_URL unset)
const FRONTEND_URL = process.env.FRONTEND_URL || '*';
app.use(cors({
  origin: FRONTEND_URL === '*' ? true : FRONTEND_URL,
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));

// Health check (Render uses this to verify the service is live)
app.get('/', (_req, res) => {
  res.json({
    name: 'Quantum Mind Backend',
    status: 'online',
    version: '1.0.0',
    endpoints: ['/api/jarvis', '/api/jarvis/approve', '/api/jarvis/status'],
  });
});

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// Mount JARVIS API routes
app.use('/api', jarvisRouter);

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, () => {
  console.log(`✅ Quantum Mind Backend running on port ${PORT}`);
  console.log(`📡 CORS allowed origin: ${FRONTEND_URL}`);
  console.log(`🧠 JARVIS endpoints:`);
  console.log(`   POST /api/jarvis`);
  console.log(`   POST /api/jarvis/approve`);
  console.log(`   GET  /api/jarvis/status`);
});
