import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { askJarvis } from '../lib/jarvisBrain';
import { getMonitorStatus } from '../lib/tools/monitor';

const router = Router();

router.post('/jarvis-ask', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    const reply = await askJarvis(message);
    res.json({ reply, status: getMonitorStatus() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
