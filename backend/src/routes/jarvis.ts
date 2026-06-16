import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { askJarvis } from '../lib/jarvisBrain';
import { getMonitorStatus } from '../lib/monitor';

const router = Router();

/**
 * POST /api/jarvis-ask
 * Receives chat/voice commands from frontend, sends to JARVIS Brain, returns reply.
 */
router.post('/jarvis-ask', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    // Call the JARVIS Brain (which talks to Cloudflare Worker / AI)
    const replyText = await askJarvis(message);
    
    res.json({ 
      success: true, 
      reply: replyText,
      status: getMonitorStatus() 
    });
  } catch (error: any) {
    console.error('[JARVIS API Error]', error.message);
    res.status(500).json({ error: 'Jarvis processing failed.' });
  }
});

export default router;
