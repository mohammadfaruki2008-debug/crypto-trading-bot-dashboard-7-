/**
 * Dashboard API — what the React frontend calls for portfolio, trades, prices.
 */
import { Router, Request, Response } from 'express';
import { fetchPrice, fetch24hStats, fetchCandles, validateKeys } from '../lib/binance';
import { getPortfolio } from '../lib/tools/portfolio';
import { getOpenTrades, getAllTrades, getRiskState } from '../lib/tools/trade';
import { getAlerts, setAlert, removeAlert } from '../lib/tools/alert';
import { getFullAnalysis } from '../lib/indicators';
import { config } from '../config';

const router = Router();

/** GET /api/health */
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', ts: Date.now(), uptime: process.uptime() });
});

/** GET /api/validate-binance — check if Binance keys work */
router.get('/validate-binance', async (_req: Request, res: Response) => {
  const v = await validateKeys();
  res.json({ ...v, testnet: config.binance.testnet });
});

/** GET /api/price/:symbol */
router.get('/price/:symbol', async (req: Request, res: Response) => {
  const p = await fetchPrice(req.params.symbol);
  res.json({ symbol: req.params.symbol.toUpperCase(), price: p });
});

/** GET /api/ticker/:symbol — 24h stats */
router.get('/ticker/:symbol', async (req: Request, res: Response) => {
  const data = await fetch24hStats(req.params.symbol);
  res.json(data);
});

/** GET /api/candles/:symbol?interval=1h&limit=300 */
router.get('/candles/:symbol', async (req: Request, res: Response) => {
  const interval = (req.query.interval as string) || '1h';
  const limit = Number(req.query.limit) || 300;
  const candles = await fetchCandles(req.params.symbol, interval, limit);
  res.json({ symbol: req.params.symbol.toUpperCase(), interval, candles });
});

/** GET /api/analysis/:symbol?interval=1h */
router.get('/analysis/:symbol', async (req: Request, res: Response) => {
  const interval = (req.query.interval as string) || '1h';
  const data = await getFullAnalysis(req.params.symbol, interval);
  res.json(data);
});

/** GET /api/portfolio */
router.get('/portfolio', async (_req: Request, res: Response) => {
  res.json(await getPortfolio());
});

/** GET /api/trades?status=open */
router.get('/trades', (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const trades = status ? getAllTrades().filter(t => t.status === status) : getAllTrades();
  res.json({ trades: trades.slice(0, 100), count: trades.length });
});

/** GET /api/trades/open */
router.get('/trades/open', (_req: Request, res: Response) => {
  res.json({ trades: getOpenTrades() });
});

/** GET /api/stats */
router.get('/stats', (_req: Request, res: Response) => {
  const risk = getRiskState();
  const open = getOpenTrades();
  res.json({
    ...risk,
    openTrades: open.length,
    winRate: risk.totalTrades > 0 ? (risk.wins / risk.totalTrades) * 100 : 0,
  });
});

/** GET /api/alerts */
router.get('/alerts', (_req: Request, res: Response) => {
  res.json({ alerts: getAlerts() });
});

/** POST /api/alerts  body: { symbol, price, direction, note? } */
router.post('/alerts', (req: Request, res: Response) => {
  const { symbol, price, direction, note } = req.body;
  if (!symbol || !price || !direction) return res.status(400).json({ error: 'symbol, price, direction required' });
  res.json({ alert: setAlert(symbol, Number(price), direction === 'below' ? 'below' : 'above', note) });
});

/** DELETE /api/alerts/:id */
router.delete('/alerts/:id', (req: Request, res: Response) => {
  const ok = removeAlert(req.params.id);
  res.json({ ok });
});

/** POST /api/webhook — TradingView webhook receiver */
router.post('/webhook', async (req: Request, res: Response) => {
  const { secret } = req.body;
  if (secret !== config.security.webhookSecret) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }
  // Queue the payload for the JARVIS brain to process on next monitor tick
  // (or process immediately if you want)
  console.log('[WEBHOOK] received:', req.body);
  res.json({ ok: true, message: 'Webhook received' });
});

export { router as dashboardRouter };
