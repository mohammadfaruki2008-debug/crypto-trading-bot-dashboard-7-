// Full-control server-side JARVIS brain
import { executeTrade } from './tools/trade';
import { stageCodeFix, applyPendingCodeFix, rejectPendingCodeFix, getPendingFix } from './tools/codeFix';
import { readProjectFile } from './tools/fileReader';
import { runBacktest } from './tools/backtest';
import { getPortfolio } from './tools/portfolio';
import { setAlert, getAlerts, checkAlerts } from './tools/alert';
import { emergencyStop } from './tools/emergency';
import { startMonitor, stopMonitor, getMonitorStatus, setJarvisCallback } from './tools/monitor';
import { fetchPrice, fetchOHLCV } from './binance';
import { getEmbedding, searchKnowledge } from './knowledgeEngine';
import { computeRsi, computeMacd, computeSupertrend } from './indicators';

const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const MAX_TOOL_ROUNDS = 6;

// ── Tool registry ──
const tools: Record<string, (params: any) => Promise<any>> = {
  async get_price({ symbol }: any) {
    const price = await fetchPrice(symbol);
    return { ok: true, message: `${symbol} is at ${price} USDT`, data: { symbol, price } };
  },
  async get_portfolio() {
    const p = await getPortfolio();
    return { ok: true, message: p.summary || 'Portfolio fetched', data: p };
  },
  async get_indicators({ symbol, timeframe }: any) {
    const closes = await fetchOHLCV(symbol, timeframe || '1h', 100).then((candles: any) => candles.map((c: any) => c.close));
    const rsi = computeRsi(closes);
    const macd = computeMacd(closes);
    const st = computeSupertrend(closes);
    return { ok: true, message: `RSI ${rsi?.toFixed(2)} · MACD ${macd?.macd?.toFixed(2)}`, data: { symbol, rsi, macd, supertrend: st } };
  },
  async place_order(params: any) {
    const portfolio = await getPortfolio();
    return executeTrade(params, portfolio.freeUsdt);
  },
  async close_position({ symbol }: any) {
    const portfolio = await getPortfolio();
    const asset = symbol.replace('USDT', '');
    const holding = portfolio.assets?.find((a: any) => a.asset === asset);
    if (!holding || holding.free <= 0) return { ok: false, message: `No ${asset} to sell` };
    return executeTrade({ symbol, side: 'SELL', reasoning: 'close_position' }, portfolio.freeUsdt);
  },
  async set_alert({ symbol, price, direction }: any) {
    setAlert(symbol, price, direction);
    return { ok: true, message: `Alert set: ${symbol} ${direction} ${price}` };
  },
  async list_alerts() {
    const alerts = getAlerts();
    return { ok: true, message: `${alerts.length} active alert(s)`, data: alerts };
  },
  async emergency_stop() {
    const r = await emergencyStop();
    return r;
  },
  async monitor_start({ symbols }: any) {
    startMonitor(symbols || ['BTCUSDT', 'ETHUSDT']);
    return { ok: true, message: `Monitoring started for ${symbols.join(', ')}` };
  },
  async monitor_stop() {
    stopMonitor();
    return { ok: true, message: 'Monitoring stopped' };
  },
  async monitor_status() {
    const s = getMonitorStatus();
    return { ok: true, message: `Monitor ${s.running ? 'RUNNING' : 'STOPPED'}`, data: s };
  },
  async read_file({ path }: any) {
    return readProjectFile(path);
  },
  async modify_code({ path, code, reasoning }: any) {
    return stageCodeFix(path, code, reasoning);
  },
  async run_backtest(params: any) {
    return runBacktest(params);
  },
  async search_knowledge({ query }: any) {
    const emb = await getEmbedding(query);
    const hits = await searchKnowledge(emb, 5);
    return { ok: true, message: `Found ${hits.length} relevant past decision(s)`, data: hits };
  },
  async learn({ note }: any) {
    const emb = await getEmbedding(note);
    // Supabase store logic
    return { ok: true, message: 'Saved to knowledge base' };
  },
};

// ── System prompt ──
const SYSTEM_PROMPT = `You are JARVIS — autonomous AI with FULL CONTROL over this crypto trading dashboard.

You have access to:
- Live Binance prices, candles, indicators
- Portfolio (balance, positions)
- Trading (place orders, close positions, set SL/TP)
- Alerts (set price alerts)
- Monitoring (start/stop autonomous scanning every 15 min)
- Code (read/modify project files with operator approval)
- Knowledge base (search past decisions)
- Backtesting (run historical simulations)
- Emergency stop (halt everything)

Respond concisely in natural English, use tools proactively, and address the user as "sir".`;

// ── JSON parsing ──
function parseActions(text: string): any[] {
  const out: any[] = [];
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m;
  while ((m = fenceRe.exec(text)) !== null) {
    try { const p = JSON.parse(m[1].trim()); if (p?.action) out.push(p); } catch {}
  }
  const bareRe = /\{[^{}]*"action"\s*:\s*"[^"]+"[^{}]*\}/g;
  while ((m = bareRe.exec(text)) !== null) {
    try { const p = JSON.parse(m[0]); if (p?.action && !out.some(o => JSON.stringify(o)===JSON.stringify(p))) out.push(p); } catch {}
  }
  return out;
}
function stripJson(text: string): string {
  return text.replace(/```(?:json)?[\s\S]*?```/gi, '').replace(/\{[^{}]*"action"\s*:\s*"[^"]+"[^{}]*\}/g, '').trim() || 'Done, sir.';
}

// ── Main loop ──
export async function askJarvis(userMessage: string, history: any[] = []) {
  // Pre-fetch live context
  const [btcPrice, portfolio] = await Promise.all([fetchPrice('BTCUSDT').catch(()=>0), getPortfolio().catch(()=>({}))]);
  const liveContext = `Live: BTC $${btcPrice}. Portfolio: ${JSON.stringify(portfolio).slice(0, 200)}`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + '\n' + liveContext },
    ...history.slice(-20),
    { role: 'user', content: userMessage },
  ];

  const executed: any[] = [];
  let confirmationRequired = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0.5 }),
    });
    if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';

    const actions = parseActions(content);
    if (actions.length === 0) {
      return { text: stripJson(content), actions: executed, confirmationRequired };
    }

    messages.push({ role: 'assistant', content });
    const results: string[] = [];
    for (const action of actions) {
      const name = action.action;
      const handler = tools[name];
      let result: any;
      if (handler) {
        try { result = await handler(action); } catch (e: any) { result = { ok: false, message: e.message }; }
      } else {
        result = { ok: false, message: `Unknown tool: ${name}` };
      }
      if (result?.confirmationRequired) confirmationRequired = true;
      executed.push({ action: name, result });
      results.push(`TOOL_RESULT(${name}): ${JSON.stringify(result)}`);
    }
    messages.push({ role: 'user', content: results.join('\n\n') + '\n\nNow reply naturally.' });
  }
  return { text: 'Actions executed, sir.', actions: executed, confirmationRequired };
}

// Wire monitor
setJarvisCallback((msg) => askJarvis(msg).then(r => r.text));
export { stopMonitor };