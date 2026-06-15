/**
 * JARVIS Express routes — drop into your existing server.ts.
 *
 * Usage in server.ts:
 *   import { jarvisRouter } from './routes/jarvisRoutes';
 *   app.use('/api', jarvisRouter);
 */
import { Router, Request, Response } from 'express';
import { askJarvis } from '../lib/jarvisBrain';
import { applyPendingCodeFix, rejectPendingCodeFix, getPendingFix } from '../lib/tools/codeFix';
import { getMonitorStatus } from '../lib/tools/monitor';
import { getAlerts } from '../lib/tools/alert';

const router = Router();

/** Conversation history (in-memory per session — production: use Redis/DB). */
const conversationHistory: { role: string; content: string }[] = [];

/**
 * POST /api/jarvis
 * Body: { message: string }
 * Returns: { reply: string, confirmationRequired: boolean, actions: any[] }
 */
router.post('/jarvis', async (req: Request, res: Response) => {
  try {
    const { message } = req.body as { message?: string };
    if (!message) return res.status(400).json({ error: 'message required' });

    conversationHistory.push({ role: 'user', content: message });

    const result = await askJarvis(message, conversationHistory);

    // askJarvis returns { text: string, actions: any[], confirmationRequired: boolean }
    const replyText = result.text || result.reply || '';

    conversationHistory.push({ role: 'assistant', content: replyText });

    // Trim history to last 40 messages
    while (conversationHistory.length > 40) conversationHistory.shift();

    res.json({
      reply: replyText,
      confirmationRequired: result.confirmationRequired || false,
      actions: result.actions || [],
    });
  } catch (err: any) {
    console.error('[JARVIS ROUTE]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/jarvis/approve
 * Body: { approved: boolean }
 * Applies or rejects the pending code fix.
 */
router.post('/jarvis/approve', (req: Request, res: Response) => {
  const { approved } = req.body as { approved?: boolean };

  if (approved) {
    const result = applyPendingCodeFix();
    conversationHistory.push({ role: 'user', content: `Operator approved the code fix.` });
    conversationHistory.push({ role: 'assistant', content: result.message });
    res.json(result);
  } else {
    const result = rejectPendingCodeFix();
    conversationHistory.push({ role: 'user', content: `Operator rejected the code fix.` });
    conversationHistory.push({ role: 'assistant', content: result.message });
    res.json(result);
  }
});

/**
 * GET /api/jarvis/status
 * Returns monitor status, active alerts, and pending code fixes.
 */
router.get('/jarvis/status', (_req: Request, res: Response) => {
  res.json({
    monitor: getMonitorStatus(),
    alerts: getAlerts(),
    pendingCodeFix: getPendingFix() ? {
      path: getPendingFix()!.filePath,
      reasoning: getPendingFix()!.reasoning,
    } : null,
  });
});

export { router as jarvisRouter };