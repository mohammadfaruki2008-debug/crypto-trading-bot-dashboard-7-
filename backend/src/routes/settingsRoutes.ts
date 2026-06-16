/**
 * Settings API — persistent encrypted Binance credentials.
 * All write endpoints require X-Admin-Token.
 *
 * GET  /api/settings/status   → { configured, testnet, source, preview }
 * POST /api/settings/save     → save encrypted credentials to DB
 * POST /api/settings/test     → validate currently-saved credentials
 * DELETE /api/settings        → wipe stored credentials
 */
import { Router, Request, Response } from 'express';
import { requireAdmin } from '../middleware/auth';
import {
  saveBinanceCredentials,
  getSettingsStatus,
  deleteBinanceCredentials,
  invalidateCache,
} from '../lib/settingsStore';
import { validateKeys } from '../lib/binance';

const router = Router();

/** GET /api/settings/status — safe (no secrets returned). */
router.get('/settings/status', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const status = await getSettingsStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/settings/save  body: { apiKey, apiSecret, testnet } */
router.post('/settings/save', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { apiKey, apiSecret, testnet } = req.body as {
      apiKey?: string; apiSecret?: string; testnet?: boolean;
    };
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'apiKey and apiSecret required' });
    }
    const result = await saveBinanceCredentials({
      apiKey: String(apiKey).trim(),
      apiSecret: String(apiSecret).trim(),
      testnet: !!testnet,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/settings/test — verify saved keys against Binance. */
router.post('/settings/test', requireAdmin, async (_req: Request, res: Response) => {
  try {
    invalidateCache(); // force fresh load from DB
    const v = await validateKeys();
    const status = await getSettingsStatus();
    res.json({ ...v, ...status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/settings — wipe stored keys. */
router.delete('/settings', requireAdmin, async (_req: Request, res: Response) => {
  try {
    res.json(await deleteBinanceCredentials());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as settingsRouter };
