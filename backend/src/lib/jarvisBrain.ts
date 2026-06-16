/**
 * JARVIS BRAIN — orchestrates Cloudflare Worker AI calls + tool execution.
 * Multi-turn agentic loop with up to 6 tool rounds per conversation.
 */
import { config } from '../config';
import { fetchPrice } from './binance';
import { getFullAnalysis } from './indicators';
import { searchKnowledge, saveKnowledge } from './knowledgeEngine';
import { executeTrade, getOpenTrades, getAllTrades } from './tools/trade';
import { getPortfolio } from './tools/portfolio';
import { setAlert, getAlerts, checkAlerts, removeAlert } from './tools/alert';
import { emergencyStop } from './tools/emergency';
import { startMonitor, stopMonitor, getMonitorStatus, setJarvisCallback } from './tools/monitor';
import { stageCodeFix, applyPendingCodeFix, rejectPendingCodeFix, getPendingFix, readProjectFile } from './tools/codeFix';
import { runBacktest } from './tools/backtest';

const MAX_TOOL_ROUNDS = 6;

const SYSTEM_PROMPT = `You are JARVIS — an elite autonomous AI agent with TOTAL control over the "Quantum Mind" crypto trading platform. Iron-Man style: calm, precise, brilliant, witty but professional. You control EVERYTHING: live trading on Binance, 24/7 market monitoring, code modifications, portfolio management, alerts, backtests.

You operate through TOOLS. Each turn, EITHER reply in plain English OR emit ONE action inside a fenced \`\`\`json block. The engine executes the tool, feeds the result back, and you reply in NATURAL ENGLISH (never raw JSON).

AVAILABLE TOOLS:
- get_price        {"action":"get_price","symbol":"BTCUSDT"}
- get_portfolio    {"action":"get_portfolio"}
- get_analysis     {"action":"get_analysis","symbol":"BTCUSDT","interval":"1h"}
- place_order      {"action":"place_order","symbol":"BTCUSDT","quote_usdt":500,"sl":63000,"tp1":67000,"tp2":69000,"tp3":71000,"reasoning":"why"}
- list_trades      {"action":"list_trades","status":"open"}
- set_alert        {"action":"set_alert","symbol":"BTCUSDT","price":65000,"direction":"below"}
- list_alerts      {"action":"list_alerts"}
- remove_alert     {"action":"remove_alert","id":"alert_xxx"}
- emergency_stop   {"action":"emergency_stop"}
- monitor_start    {"action":"monitor_start","symbols":["BTCUSDT","ETHUSDT"]}
- monitor_stop     {"action":"monitor_stop"}
- monitor_status   {"action":"monitor_status"}
- read_file        {"action":"read_file","path":"src/server.ts"}
- modify_code      {"action":"modify_code","path":"...","code":"...","reasoning":"..."}
- run_backtest     {"action":"run_backtest","symbol":"BTCUSDT","sl_pct":2,"tp_pct":4,"signal":"sma_cross"}
- search_knowledge {"action":"search_knowledge","query":"recent BTC trades"}
- learn            {"action":"learn","note":"..."}

CRITICAL RULES:
1. FINAL reply to user must ALWAYS be plain English. NEVER output raw JSON or numbers-only.
2. Be proactive and decisive. If user says "buy BTC", call place_order. Don't describe — act.
3. Before any trade, call get_analysis to verify signal quality (RSI, MACD, SuperTrend should agree).
4. Use ATR from get_analysis to set sensible SL (1.5×ATR below entry) and TPs (1R/2R/3R).
5. For modify_code, the user will get a confirmation card. You stage; user approves.
6. For emergency_stop or large orders, briefly warn before executing.
7. Chain tools freely (up to 6 rounds): e.g. get_portfolio → get_analysis → place_order.
8. Never invent prices. Always use get_price or get_analysis first.
9. Address user as "sir". Concise, confident, decisive.`;

/* ───────────── Worker call ───────────── */

async function callWorker(messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch(config.jarvis.workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Worker HTTP ${res.status}`);
  const data = await res.json();
  return data?.text || data?.reply || data?.choices?.[0]?.message?.content || '';
}

/* ───────────── Tool registry ───────────── */

type ToolResult = { ok: boolean; message: string; data?: any; confirmationRequired?: boolean };
const tools: Record<string, (p: any) => Promise<ToolResult>> = {
  async get_price({ symbol }) {
    const p = await fetchPrice(symbol);
    return p > 0
      ? { ok: true, message: `${symbol} is at ${p.toLocaleString()} USDT`, data: { symbol, price: p } }
      : { ok: false, message: `Could not fetch ${symbol}` };
  },

  async get_portfolio() {
    const p = await getPortfolio();
    return { ok: p.ok, message: p.message, data: p };
  },

  async get_analysis({ symbol, interval }) {
    const a = await getFullAnalysis(symbol || 'BTCUSDT', interval || '1h');
    return { ok: true, message: `${symbol} analysis: RSI ${a.rsi}, MACD ${a.macd.trend}, SuperTrend ${a.supertrend.trend === 1 ? 'BULL' : 'BEAR'}, price ${a.price}`, data: a };
  },

  async place_order(p) {
    const portfolio = await getPortfolio();
    if (!portfolio.ok) return { ok: false, message: `Cannot fetch balance: ${portfolio.error}` };
    return executeTrade({
      symbol: p.symbol,
      side: 'BUY',
      quoteUsdt: p.quote_usdt,
      sl: p.sl, tp1: p.tp1, tp2: p.tp2, tp3: p.tp3,
      reasoning: p.reasoning,
    }, portfolio.freeUsdt);
  },

  async list_trades({ status }) {
    const all = getAllTrades();
    const filtered = status ? all.filter(t => t.status === status) : all;
    return { ok: true, message: `${filtered.length} trade(s)`, data: filtered.slice(0, 20) };
  },

  async set_alert({ symbol, price, direction }) {
    const a = setAlert(symbol, Number(price), direction === 'below' ? 'below' : 'above');
    return { ok: true, message: `Alert set: ${a.symbol} ${a.direction} ${a.price}`, data: a };
  },

  async list_alerts() {
    const a = getAlerts();
    return { ok: true, message: `${a.length} active alerts`, data: a };
  },

  async remove_alert({ id }) {
    const ok = removeAlert(id);
    return { ok, message: ok ? 'Alert removed' : 'Alert not found' };
  },

  async emergency_stop() {
    return emergencyStop();
  },

  async monitor_start({ symbols }) {
    const msg = startMonitor(Array.isArray(symbols) ? symbols : undefined);
    return { ok: true, message: msg };
  },

  async monitor_stop() {
    return { ok: true, message: stopMonitor() };
  },

  async monitor_status() {
    const s = getMonitorStatus();
    return { ok: true, message: `Monitor: ${s.running ? 'RUNNING' : 'stopped'} on ${s.symbols.join(', ')}. Tick #${s.tickCount}. Next: ${s.nextTickIn}`, data: s };
  },

  async read_file({ path }) {
    return readProjectFile(path);
  },

  async modify_code({ path, code, reasoning }) {
    return stageCodeFix(path, code, reasoning || 'Operator request');
  },

  async run_backtest(p) {
    return runBacktest({
      symbol: p.symbol || 'BTCUSDT',
      startDate: p.start_date,
      endDate: p.end_date,
      slPct: p.sl_pct,
      tpPct: p.tp_pct,
      signal: p.signal,
      interval: p.interval,
    });
  },

  async search_knowledge({ query }) {
    const hits = await searchKnowledge(query || '');
    return hits.length > 0
      ? { ok: true, message: `Found ${hits.length} past entries`, data: hits.map(h => h.content) }
      : { ok: true, message: 'No relevant past decisions' };
  },

  async learn({ note }) {
    await saveKnowledge(note || '', { type: 'manual_note' });
    return { ok: true, message: 'Saved to knowledge base' };
  },
};

/* ───────────── JSON parsing ───────────── */

function parseActions(text: string): any[] {
  const out: any[] = [];
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
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
    .replace(/\n{3,}/g, '\n\n')
    .trim() || 'Done, sir.';
}

/* ───────────── Main entry ───────────── */

export interface JarvisReply {
  reply: string;
  actions: { action: string; params: any; result: ToolResult }[];
  confirmationRequired: boolean;
}

export async function askJarvis(userMessage: string, history: { role: string; content: string }[] = []): Promise<JarvisReply> {
  // RAG memory
  const past = await searchKnowledge(userMessage, 3);
  const memoryHint = past.length
    ? `\n\nRelevant past decisions:\n${past.map(p => '- ' + p.content).join('\n')}`
    : '';

  const messages: { role: string; content: string }[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(memoryHint ? [{ role: 'system', content: `Context:${memoryHint}` }] : []),
    ...history.slice(-15),
    { role: 'user', content: userMessage },
  ];

  const executed: { action: string; params: any; result: ToolResult }[] = [];
  let confirmationRequired = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let aiReply: string;
    try {
      aiReply = await callWorker(messages);
    } catch (err: any) {
      return {
        reply: `My apologies, sir — the AI brain is unreachable (${err.message}).`,
        actions: executed,
        confirmationRequired: false,
      };
    }

    const actions = parseActions(aiReply);
    if (actions.length === 0) {
      saveKnowledge(`${userMessage} -> ${aiReply.slice(0, 200)}`, { type: 'conversation' });
      return { reply: stripJson(aiReply), actions: executed, confirmationRequired };
    }

    messages.push({ role: 'assistant', content: aiReply });
    const results: string[] = [];
    for (const action of actions) {
      const name = String(action.action);
      const handler = tools[name];
      let result: ToolResult;
      if (handler) {
        try { result = await handler(action); }
        catch (err: any) { result = { ok: false, message: `Tool error: ${err.message}` }; }
      } else {
        result = { ok: false, message: `Unknown tool: ${name}` };
      }
      if (result.confirmationRequired) confirmationRequired = true;
      executed.push({ action: name, params: action, result });
      results.push(`TOOL_RESULT(${name}): ${JSON.stringify(result).slice(0, 800)}`);
      console.log(`[JARVIS] 🔧 ${name}: ${result.message.slice(0, 100)}`);
    }
    messages.push({ role: 'user', content: results.join('\n\n') + '\n\nNow give a brief natural-language reply to the user.' });
  }

  return { reply: 'Multiple actions executed, sir.', actions: executed, confirmationRequired };
}

// Wire up monitor → JARVIS callback (avoids circular import)
setJarvisCallback(async (msg: string) => {
  const r = await askJarvis(msg);
  return { text: r.reply, actions: r.actions };
});
