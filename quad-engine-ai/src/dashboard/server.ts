/**
 * Dashboard REST API — equity curve, open trades, stats.
 * @module dashboard/server
 */
import express from 'express';

const app = express();
app.use(express.json());

// In-memory snapshot; in production read from PostgreSQL via drizzle.
const snapshot = {
  openTrades: [] as unknown[],
  equityCurve: [] as { t: number; equity: number }[],
  stats: { winRate: 0, sharpe: 0, maxDrawdownR: 0, totalR: 0, trades: 0 },
};

/** Liveness. */
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

/** Current open trades. */
app.get('/api/trades/open', (_req, res) => res.json({ trades: snapshot.openTrades }));

/** Equity curve points. */
app.get('/api/equity', (_req, res) => res.json({ curve: snapshot.equityCurve }));

/** Aggregate performance stats. */
app.get('/api/stats', (_req, res) => res.json(snapshot.stats));

/** Webhook intake (TradingView) — validates secret, queues alert. */
const pending: { id: string; payload: unknown }[] = [];
app.post('/api/webhook', (req, res) => {
  const secret = req.body?.secret;
  if (secret !== process.env.WEBHOOK_SECRET) return res.status(401).json({ error: 'bad secret' });
  pending.push({ id: `wh_${Date.now()}`, payload: req.body });
  res.json({ ok: true });
});
app.get('/api/webhook/pending', (_req, res) => res.json({ alerts: pending.splice(0) }));

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => console.info(`Dashboard API on :${PORT}`));

export { snapshot };
