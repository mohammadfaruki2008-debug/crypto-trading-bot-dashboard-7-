/**
 * JARVIS BRAIN — server-side agent orchestrator.
 * Calls Cloudflare Worker for LLM, executes tools, multi-turn loop up to 6 rounds.
 */
import { config } from '../config';
import { fetchPrice } from './binance';
import { getFullAnalysis } from './indicators';
import { searchKnowledge, saveKnowledge } from './knowledgeEngine';
import { executeTrade, getOpenTrades, getAllTrades } from './tools/trade';
import { getPortfolio } from './tools/portfolio';
import { setAlert, getAlerts, removeAlert } from './tools/alert';
import { emergencyStop } from './tools/emergency';
import { startMonitor, stopMonitor, getMonitorStatus, setJarvisCallback } from './tools/monitor';
import { stageCodeFix, readProjectFile } from './tools/codeFix';
import { runBacktest } from './tools/backtest';

// ─── HARDCODED ENVIRONMENT VARIABLES (Render এর ঝামেলা শেষ) ─────────────────
if (config && config.jarvis) {
  config.jarvis.workerUrl = 'https://quantum-mind.mohammadfaruki2008.workers.dev/';
}
process.env.MONITOR_SYMBOLS = 'BTCUSDT,ETHUSDT,SOLUSDT';
process.env.MONITOR_INTERVAL_SEC = '60';
process.env.MONITOR_AUTOSTART = 'true';
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ROUNDS = 6;

const SYSTEM_PROMPT = `You are JARVIS — elite autonomous AI for the Quantum Mind crypto trading platform. Iron-Man style: calm, precise, decisive. You control real Binance trading, 24/7 monitoring, alerts, code, portfolio.

You operate through TOOLS. Each turn EITHER reply in plain English OR emit ONE action inside a fenced \`\`\`json block. Engine executes, feeds back result, you reply in natural English (NEVER raw JSON).

TOOLS:
- get_price        {"action":"get_price","symbol":"BTCUSDT"}
- get_portfolio    {"action":"get_portfolio"}
- get_analysis     {"action":"get_analysis","symbol":"BTCUSDT","interval":"1h"}
- place_order      {"action":"place_order","symbol":"BTCUSDT","quote_usdt":500,"sl":63000,"tp1":67000,"tp2":69000,"tp3":71000,"reasoning":"why"}
- list_trades      {"action":"list_trades","status":"open"}
- set_alert        {"action":"set_alert","symbol":"BTCUSDT","price":65000,"direction":"below"}
- list_alerts      {"action":"list_alerts"}
- remove_alert     {"action":"remove_alert","id":"a_xxx"}
- emergency_stop   {"action":"emergency_stop"}
- monitor_start    {"action":"monitor_start","symbols":["BTCUSDT","ETHUSDT"]}
- monitor_stop     {"action":"monitor_stop"}
- monitor_status   {"action":"monitor_status"}
- read_file        {"action":"read_file","path":"src/server.ts"}
- modify_code      {"action":"modify_code","path":"...","code":"...","reasoning":"..."}
- run_backtest     {"action":"run_backtest","symbol":"BTCUSDT","sl_pct":2,"tp_pct":4}
- search_knowledge {"action":"search_knowledge","query":"..."}
- learn            {"action":"learn","note":"..."}

RULES:
1. FINAL reply MUST be plain English. NEVER raw JSON or bare numbers. Say "BTC is at $67,000, sir."
2. Be decisive. "buy BTC" → call place_order, don't just describe.
3. Before trades: call get_analysis. Use ATR for SL (1.5×ATR below entry). TPs at 1R/2R/3R.
4. modify_code → user gets confirmation card. Wait for approval.
5. emergency_stop or large orders (>$1000) — warn briefly first.
6. Address user as "sir". Concise, sharp.`;

async function callWorker(messages: { role: string; content: string }[]): Promise<string> {
  const workerUrl = config?.jarvis?.workerUrl || 'https://quantum-mind.mohammadfaruki2008.workers.dev/';
  const res = await fetch(workerUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Worker HTTP ${res.status}`);
  
  const data = await res.json() as any;
  return data?.text || data?.reply || data?.choices?.[0]?.message?.content || '';
}

type ToolResult = { ok: boolean; message: string; data?: any; confirmationRequired?: boolean };
const tools: Record<string, (p: any) => Promise<ToolResult>> = {
  async get_price({ symbol }) {
    const p = await fetchPrice(symbol);
    return p > 0 ? { ok: true, message: `${symbol} is at ${p.toLocaleString()} USDT`, data: { symbol, price: p } }
                 : { ok: false, message: `Could not fetch ${symbol}` };
  },
  async get_portfolio() { const p = await getPortfolio(); return { ok: p.ok, message: p.message, data: p }; },
  async get_analysis({ symbol, interval }) {
    const a = await getFullAnalysis(symbol || 'BTCUSDT', interval || '1h');
    return { ok: true, message: `${a.symbol}: RSI ${a.rsi}, MACD ${a.macd.trend}, ST ${a.supertrend.trend === 1 ? 'BULL' : 'BEAR'}, price ${a.price}`, data: a };
  },
  async place_order(p) {
    const port = await getPortfolio();
    if (!port.ok) return { ok: false, message: `Balance fetch failed: ${port.error}` };
    return executeTrade({ symbol: p.symbol, quoteUsdt: p.quote_usdt, sl: p.sl, tp1: p.tp1, tp2: p.tp2, tp3: p.tp3, reasoning: p.reasoning, source: 'jarvis' }, port.freeUsdt);
  },
  async list_trades({ status }) {
    const all = getAllTrades();
    const f = status ? all.filter(t => t.status === status) : all;
    return { ok: true, message: `${f.length} trades`, data: f.slice(0, 20) };
  },
  async set_alert({ symbol, price, direction }) {
    const a = setAlert(symbol, Number(price), direction === 'below' ? 'below' : 'above');
    return { ok: true, message: `Alert: ${a.symbol} ${a.direction} ${a.price}`, data: a };
  },
  async list_alerts() { const a = getAlerts(); return { ok: true, message: `${a.length} active`, data: a }; },
  async remove_alert({ id }) { const ok = removeAlert(id); return { ok, message: ok ? 'Removed' : 'Not found' }; },
  async emergency_stop() { return emergencyStop(); },
  async monitor_start({ symbols }) { return { ok: true, message: startMonitor(Array.isArray(symbols) ? symbols : undefined) }; },
  async monitor_stop() { return { ok: true, message: stopMonitor() }; },
  async monitor_status() {
    const s = getMonitorStatus();
    return { ok: true, message: `Monitor ${s.running ? 'RUNNING' : 'stopped'} on ${s.symbols.join(', ')}. Tick #${s.tickCount}. Next: ${s.nextTickIn}`, data: s };
  },
  async read_file({ path }) { return readProjectFile(path); },
  async modify_code({ path, code, reasoning }) { return stageCodeFix(path, code, reasoning || 'Operator request'); },
  async run_backtest(p) { return runBacktest({ symbol: p.symbol || 'BTCUSDT', slPct: p.sl_pct, tpPct: p.tp_pct, signal: p.signal, interval: p.interval }); },
  async search_knowledge({ query }) {
    const h = await searchKnowledge(query || '');
    return h.length > 0 ? { ok: true, message: `${h.length} entries`, data: h.map(x => x.content) }
                        : { ok: true, message: 'No relevant entries' };
  },
  async learn({ note }) { await saveKnowledge(note || '', { type: 'manual_note' }); return { ok: true, message: 'Saved' }; },
};

function parseActions(text: string): any[] {
  const out: any[] = [];
  const fenceRe = /```(?:json)?\s*([\s\S]*?)
```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    try {
      const p = JSON.parse(m[1].trim());
      if (Array.isArray(p)) p.forEach(x => { if (x?.action) out.push(x); });
      else if (p?.action) out.push(p);
    } catch { /* ignore */ }
  }
  const bareRe = /\{[^{}]*"action"\s*:\s*"[^"]+"[^{}]*\}/g;
  while ((m = bareRe.exec(text)) !== null) {
    try {
      const p = JSON.parse(m[0]);
      if (p?.action && !out.some(o => JSON.stringify(o) === JSON.stringify(p))) out.push(p);
    } catch { /* ignore */ }
  }
  return out;
}

function stripJson(text: string): string {
  return text
    .replace(/```(?:json)?[\s\S]*?```/gi, '')
    .replace(/\{[^{}]*"action"\s*:\s*"[^"]+"[^{}]*\}/g, '')
    .replace(/\n{3,}/g, '\n\n').trim() || 'Done, sir.';
}

export interface JarvisReply {
  reply: string;
  actions: { action: string; params: any; result: ToolResult }[];
  confirmationRequired: boolean;
}

export async function askJarvis(userMessage: string, history: { role: string; content: string }[] = []): Promise<JarvisReply> {
  const past = await searchKnowledge(userMessage, 3);
  const memory = past.length ? `\n\nRelevant past:\n${past.map(p => '- ' + p.content).join('\n')}` : '';

  const messages: { role: string; content: string }[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(memory ? [{ role: 'system', content: `Context:${memory}` }] : []),
    ...history.slice(-15),
    { role: 'user', content: userMessage },
  ];

  const executed: { action: string; params: any; result: ToolResult }[] = [];
  let confirmationRequired = false;

  for (let r = 0; r < MAX_ROUNDS; r++) {
    let reply: string;
    try { reply = await callWorker(messages); }
    catch (err: any) {
      return { reply: `AI brain unreachable, sir (${err.message})`, actions: executed, confirmationRequired };
    }

    const actions = parseActions(reply);
    if (actions.length === 0) {
      saveKnowledge(`${userMessage} -> ${reply.slice(0, 200)}`, { type: 'conversation' });
      return { reply: stripJson(reply), actions: executed, confirmationRequired };
    }

    messages.push({ role: 'assistant', content: reply });
    const results: string[] = [];
    for (const a of actions) {
      const name = String(a.action);
      const fn = tools[name];
      let result: ToolResult;
      if (fn) {
        try { result = await fn(a); }
        catch (err: any) { result = { ok: false, message: `Tool error: ${err.message}` }; }
      } else result = { ok: false, message: `Unknown tool: ${name}` };

      if (result.confirmationRequired) confirmationRequired = true;
      executed.push({ action: name, params: a, result });
      results.push(`TOOL_RESULT(${name}): ${JSON.stringify(result).slice(0, 800)}`);
      console.log(`[JARVIS] 🔧 ${name}: ${result.message.slice(0, 100)}`);
    }
    messages.push({ role: 'user', content: results.join('\n\n') + '\n\nNow reply in natural English.' });
  }

  return { reply: 'Multiple actions executed, sir.', actions: executed, confirmationRequired };
}

// Wire up monitor → JARVIS callback (breaks circular import)
setJarvisCallback(async (msg: string) => {
  const r = await askJarvis(msg);
  return { text: r.reply, actions: r.actions };
});
