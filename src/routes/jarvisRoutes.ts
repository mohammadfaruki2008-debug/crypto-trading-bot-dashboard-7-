import { Router, Request, Response } from 'express';

const router = Router();

// Simple in-memory state for demonstration
let monitorStatus = { running: false, symbols: ['BTCUSDT', 'ETHUSDT'] };
let alerts: any[] = [];

/**
 * POST /api/jarvis
 * Handles chat messages from the React frontend.
 */
router.post('/jarvis', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // In a full implementation, this would call the Cloudflare Worker or Groq.
    // For now, we return a simulated response to keep the server lightweight and functional.
    const reply = `I have received your command: "${message}". System operational.`;
    
    res.json({ reply, confirmationRequired: false });
  } catch (error: any) {
    console.error('[JARVIS Route Error]', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/jarvis/approve
 * Handles approval for code fixes or trades.
 */
router.post('/jarvis/approve', (req: Request, res: Response) => {
  const { approved } = req.body;
  if (approved) {
    res.json({ ok: true, message: 'Action approved successfully.' });
  } else {
    res.json({ ok: false, message: 'Action rejected.' });
  }
});

/**
 * GET /api/health
 * Server health check
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

/**
 * GET /api/jarvis/status
 * Returns monitor status and active alerts.
 */
router.get('/jarvis/status', (_req: Request, res: Response) => {
  res.json({
    monitor: monitorStatus,
    alerts: alerts,
    pendingCodeFix: null
  });
});

export { router as jarvisRouter };
