/**
 * Dashboard API — public read endpoints + protected write endpoints.
 */
import { Router, Request, Response } from 'express';
import { fetchPrice, fetch24h, fetchCandles, validateKeys } from '../lib/binance';
import { getPortfolio } from '../lib/tools/portfolio';
import { executeTrade, getOpenTrades, getAllTrades, getRiskState } from '../lib/tools/trade';
import { getAlerts, setAlert, removeAlert } from '../lib/tools/alert';
import { getFullAnalysis } from '../lib/indicators';
import { emergencyStop } from '../lib/tools/emergency';
import { config } from '../config';
import { requireAdmin } from '../middleware/auth';

const router = Router();

/* ── PUBLIC read endpoints ── */
router.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime(), ts: Date.now() }));
router.get('/price/:symbol', async (req, res) => res.json({ symbol: req.params.symbol.toUpperCase(), price: await fetchPrice(req.params.symbol) }));
router.get('/ticker/:symbol', async (req, res) => res.json(await fetch24h(req.params.symbol)));
router.get('/candles/:symbol', async (req, res) => {
  const interval = (req.query.interval as string) || '1h';
  const limit = Number(req.query.limit) || 300;
  res.json({ symbol: req.params.symbol.toUpperCase(), interval, candles: await fetchCandles(req.params.symbol, interval, limit) });
});
router.get('/analysis/:symbol', async (req, res) => {
  const interval = (req.query.interval as string) || '1h';
  res.json(await getFullAnalysis(req.params.symbol, interval));
});

/* ── PROTECTED endpoints (require X-Admin-Token) ── */
router.get('/validate-binance', requireAdmin, async (_req, res) => {
  const v = await validateKeys();
  res.json({ ...v, testnet: config.binance.testnet });
});

router.get('/portfolio', requireAdmin, async (_req, res) => res.json(await getPortfolio()));

router.get('/trades', requireAdmin, (req, res) => {
  const status = req.query.status as string | undefined;
  const trades = status ? getAllTrades().filter(t => t.status === status) : getAllTrades();
  res.json({ trades: trades.slice(0, 100), count: trades.length });
});

router.get('/trades/open', requireAdmin, (_req, res) => res.json({ trades: getOpenTrades() }));

router.get('/stats', requireAdmin, (_req, res) => {
  const r = getRiskState(); const open = getOpenTrades();
  res.json({ ...r, openTrades: open.length, winRate: r.totalTrades > 0 ? (r.wins / r.totalTrades) * 100 : 0 });
});

router.post('/trade', requireAdmin, async (req, res) => {
  const { symbol, quoteUsdt, sl, tp1, tp2, tp3, reasoning } = req.body;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  const port = await getPortfolio();
  if (!port.ok) return res.status(500).json({ error: port.error });
  res.json(await executeTrade({ symbol, quoteUsdt, sl, tp1, tp2, tp3, reasoning, source: 'manual_api' }, port.freeUsdt));
});

router.post('/emergency-stop', requireAdmin, async (_req, res) => res.json(await emergencyStop()));

router.get('/alerts', requireAdmin, (_req, res) => res.json({ alerts: getAlerts() }));
router.post('/alerts', requireAdmin, (req, res) => {
  const { symbol, price, direction, note } = req.body;
  if (!symbol || !price || !direction) return res.status(400).json({ error: 'symbol, price, direction required' });
  res.json({ alert: setAlert(symbol, Number(price), direction === 'below' ? 'below' : 'above', note) });
});
router.delete('/alerts/:id', requireAdmin, (req, res) => res.json({ ok: removeAlert(req.params.id) }));

/* ── Webhook receiver (uses webhook secret, not admin token) ── */
router.post('/webhook', (req: Request, res: Response) => {
  const { secret } = req.body;
  if (secret !== config.security.webhookSecret) return res.status(401).json({ error: 'Invalid webhook secret' });
  console.log('[WEBHOOK]', req.body);
  res.json({ ok: true, message: 'Webhook received' });
});

export { router as dashboardRouter };
