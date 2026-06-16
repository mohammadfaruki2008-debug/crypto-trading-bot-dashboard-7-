import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getAccountBalance } from '../lib/binance';

const router = Router();

router.get('/portfolio', requireAuth, async (req, res) => {
  try {
    const data = await getAccountBalance();
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
