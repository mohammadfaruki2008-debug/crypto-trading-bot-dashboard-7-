/**
 * JARVIS API routes — all protected by admin token.
 */
import { Router, Request, Response } from 'express';
import { askJarvis } from '../lib/jarvisBrain';
import { applyPendingCodeFix, rejectPendingCodeFix, getPendingFix } from '../lib/tools/codeFix';
import { getMonitorStatus, startMonitor, stopMonitor } from '../lib/tools/monitor';
import { getAlerts } from '../lib/tools/alert';
import { requireAdmin } from '../middleware/auth';

const router = Router();
const historyMap = new Map<string, { role: string; content: string }[]>();

/** POST /api/jarvis-ask  body: { message, sessionId? } */
router.post('/jarvis-ask', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { message, sessionId } = req.body as { message?: string; sessionId?: string };
    if (!message) return res.status(400).json({ error: 'message required' });
    const sid = sessionId || 'default';
    const hist = historyMap.get(sid) || [];
    hist.push({ role: 'user', content: message });
    const result = await askJarvis(message, hist);
    hist.push({ role: 'assistant', content: result.reply });
    while (hist.length > 30) hist.shift();
    historyMap.set(sid, hist);
    res.json({ reply: result.reply, actions: result.actions, confirmationRequired: result.confirmationRequired });
  } catch (err: any) {
    console.error('[JARVIS]', err);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/jarvis-approve  body: { approved: boolean } */
router.post('/jarvis-approve', requireAdmin, (req: Request, res: Response) => {
  const { approved } = req.body as { approved?: boolean };
  res.json(approved ? applyPendingCodeFix() : rejectPendingCodeFix());
});

/** GET /api/jarvis-status — public; safe (no secrets) */
router.get('/jarvis-status', (_req: Request, res: Response) => {
  const pending = getPendingFix();
  res.json({
    monitor: getMonitorStatus(),
    alerts: getAlerts(),
    pendingCodeFix: pending ? { path: pending.filePath, reasoning: pending.reasoning, stagedAt: pending.stagedAt } : null,
  });
});

router.post('/monitor-start', requireAdmin, (req: Request, res: Response) => {
  const { symbols } = req.body as { symbols?: string[] };
  res.json({ ok: true, message: startMonitor(symbols) });
});

router.post('/monitor-stop', requireAdmin, (_req: Request, res: Response) => {
  res.json({ ok: true, message: stopMonitor() });
});

export { router as jarvisRouter };
