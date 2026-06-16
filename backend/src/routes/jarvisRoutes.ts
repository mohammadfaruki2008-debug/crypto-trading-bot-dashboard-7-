/**
 * JARVIS API routes.
 */
import { Router, Request, Response } from 'express';
import { askJarvis } from '../lib/jarvisBrain';
import { applyPendingCodeFix, rejectPendingCodeFix, getPendingFix } from '../lib/tools/codeFix';
import { getMonitorStatus, startMonitor, stopMonitor } from '../lib/tools/monitor';
import { getAlerts } from '../lib/tools/alert';

const router = Router();

// In-memory conversation history (per-session; for production use Redis/DB)
const historyMap = new Map<string, { role: string; content: string }[]>();

/** POST /api/jarvis  body: { message, sessionId? } */
router.post('/jarvis', async (req: Request, res: Response) => {
  try {
    const { message, sessionId } = req.body as { message?: string; sessionId?: string };
    if (!message) return res.status(400).json({ error: 'message required' });

    const sid = sessionId || 'default';
    const history = historyMap.get(sid) || [];
    history.push({ role: 'user', content: message });

    const result = await askJarvis(message, history);

    history.push({ role: 'assistant', content: result.reply });
    while (history.length > 30) history.shift();
    historyMap.set(sid, history);

    res.json({
      reply: result.reply,
      actions: result.actions,
      confirmationRequired: result.confirmationRequired,
    });
  } catch (err: any) {
    console.error('[JARVIS ROUTE]', err);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/jarvis/approve  body: { approved: boolean } */
router.post('/jarvis/approve', (req: Request, res: Response) => {
  const { approved } = req.body as { approved?: boolean };
  const result = approved ? applyPendingCodeFix() : rejectPendingCodeFix();
  res.json(result);
});

/** GET /api/jarvis/status */
router.get('/jarvis/status', (_req: Request, res: Response) => {
  const pending = getPendingFix();
  res.json({
    monitor: getMonitorStatus(),
    alerts: getAlerts(),
    pendingCodeFix: pending ? { path: pending.filePath, reasoning: pending.reasoning, stagedAt: pending.stagedAt } : null,
  });
});

/** POST /api/jarvis/monitor/start  body: { symbols?: string[] } */
router.post('/jarvis/monitor/start', (req: Request, res: Response) => {
  const { symbols } = req.body as { symbols?: string[] };
  res.json({ ok: true, message: startMonitor(symbols) });
});

/** POST /api/jarvis/monitor/stop */
router.post('/jarvis/monitor/stop', (_req: Request, res: Response) => {
  res.json({ ok: true, message: stopMonitor() });
});

export { router as jarvisRouter };
