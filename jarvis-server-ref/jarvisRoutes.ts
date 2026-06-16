// ============================================================================
// REFERENCE: server-side Jarvis route for a real Node/Express backend.
//
// This file is NOT compiled by the Vite frontend (it lives outside src/).
// Drop it into your existing Express project (the one with binance.ts,
// indicators.ts, knowledgeEngine.ts) and mount it:
//
//   import { jarvisRouter } from './jarvisRoutes';
//   app.use('/api', jarvisRouter);
//
// The browser agent (src/lib/jarvisBrain.ts) uses the IDENTICAL tool protocol,
// so moving to the server later is a drop-in swap — just point askJarvis()
// at POST /api/jarvis instead of calling Groq directly.
// ============================================================================

import { Router, Request, Response } from 'express';
import { fetchPrice, placeBinanceOrder } from './binance';            // your existing module
import { computeRsi, computeMacd, computeSupertrend } from './indicators';
import { getEmbedding, searchKnowledge, saveKnowledge } from './knowledgeEngine';

const router = Router();

// ---- Proactive monitor state (kept on the server) ----
let monitorTimer: NodeJS.Timeout | null = null;
const lastSignalAt: Record<string, number> = {};

/**
 * askJarvis — server-side agent loop. Identical JSON-tool protocol to the
 * browser version but using server resources (Binance keys, Supabase, no CORS).
 */
async function askJarvis(userMessage: string): Promise<{ reply: string }> {
  const GROQ_KEY = process.env.GROQ_API_KEY!;
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  for (let round = 0; round < 6; round++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, temperature: 0.55 }),
    });
    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';

    const actions = extractJsonActions(content);
    if (actions.length === 0) {
      // self-learning: store the decision for future RAG
      await saveKnowledge(getEmbedding(`${userMessage} => ${content.slice(0, 200)}`), { userMessage, content });
      return { reply: content };
    }

    messages.push({ role: 'assistant', content });
    for (const action of actions) {
      const result = await executeTool(action);
      messages.push({ role: 'user', content: `TOOL_RESULT(${action.action}): ${JSON.stringify(result)}` });
    }
  }
  return { reply: 'Done, sir.' };
}

async function executeTool(action: any): Promise<any> {
  switch (action.action) {
    case 'get_price': {
      const price = await fetchPrice(action.symbol);
      return { ok: true, price };
    }
    case 'get_indicators': {
      // fetch candles (your binance.ts) then compute
      const rsi = computeRsi(/* candles */); const macd = computeMacd(); const st = computeSupertrend();
      return { ok: true, rsi, macd, supertrend: st };
    }
    case 'place_order': {
      const order = await placeBinanceOrder(action.symbol, action.side, action.quantity, action.sl, action.tp);
      return { ok: !order.error, order };
    }
    case 'search_knowledge': {
      const emb = await getEmbedding(action.query);
      const hits = await searchKnowledge(emb);
      return { ok: true, hits };
    }
    case 'emergency_stop': {
      // close all positions + halt monitor
      if (monitorTimer) { clearInterval(monitorTimer); monitorTimer = null; }
      return { ok: true, message: 'halted' };
    }
    default:
      return { ok: false, message: `unknown tool ${action.action}` };
  }
}

function extractJsonActions(text: string): any[] {
  const out: any[] = [];
  const re = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try { const p = JSON.parse(m[1].trim()); if (p.action) out.push(p); } catch { /* ignore */ }
  }
  return out;
}

const SYSTEM_PROMPT = `You are JARVIS... (same prompt as src/lib/jarvisBrain.ts systemPrompt())`;

/** POST /api/jarvis  body: { message: string } → { reply: string } */
router.post('/jarvis', async (req: Request, res: Response) => {
  try {
    const { message } = req.body as { message?: string };
    if (!message) return res.status(400).json({ error: 'message required' });
    const { reply } = await askJarvis(message);
    res.json({ reply });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/jarvis/monitor/start?symbols=BTCUSDT,ETHUSDT */
router.get('/jarvis/monitor/start', (req: Request, res: Response) => {
  const symbols = (req.query.symbols as string || 'BTCUSDT,ETHUSDT').split(',');
  if (monitorTimer) clearInterval(monitorTimer);
  const tick = async () => { /* same proactive logic as jarvisBrain.startProactiveMonitor */ };
  tick();
  monitorTimer = setInterval(tick, 15 * 60 * 1000);
  res.json({ ok: true, symbols });
});

/** GET /api/jarvis/monitor/stop */
router.get('/jarvis/monitor/stop', (_req: Request, res: Response) => {
  if (monitorTimer) { clearInterval(monitorTimer); monitorTimer = null; }
  res.json({ ok: true });
});

export { router as jarvisRouter };
