/**
 * JARVIS BRAIN — server-side autonomous AI agent orchestrator.
 * Uses Groq API (llama-3.3-70b-versatile) with a JSON tool-calling protocol.
 * All tools are REAL server-side operations (fs, Binance API, child processes).
 */
import { executeTrade } from './tools/trade';
import { stageCodeFix, applyPendingCodeFix, rejectPendingCodeFix, getPendingFix } from './tools/codeFix';
import { readProjectFile } from './tools/fileReader';
import { runBacktest } from './tools/backtest';
import { getPortfolio } from './tools/portfolio';
import { setAlert, getAlerts, checkAlerts } from './tools/alert';
import { emergencyStop } from './tools/emergency';
import { startMonitor, stopMonitor, getMonitorStatus, setJarvisCallback } from './tools/monitor';
import { fetchPrice } from './binance';
import { getEmbedding, searchKnowledge } from './knowledgeEngine';

const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const MAX_TOOL_ROUNDS = 6;

/* ─────────────────────────── Tool Registry ─────────────────────────── */

type ToolResult = { ok: boolean; message: string; data?: unknown; confirmationRequired?: boolean };
type ToolFn = (params: Record<string, any>) => Promise<ToolResult>;

const tools: Record<string, ToolFn> = {
  async get_price({ symbol }) {
    const price = await fetchPrice(symbol);
    return { ok: true, message: `${symbol} is at ${price.toLocaleString()} USDT`, data: { symbol, price } };
  },

  async get_portfolio() {
    const p = await getPortfolio();
    return { ok: p.ok, message: p.message, data: p };
  },

  async place_order(params) {
    const portfolio = await getPortfolio();
    const result = await executeTrade({
      symbol: params.symbol,
      side: params.side || 'BUY',
      quoteUsdt: params.quote_usdt,
      sl: params.sl,
      tp1: params.tp1,
      tp2: params.tp2,
      tp3: params.tp3,
      reasoning: params.reasoning,
    }, portfolio.freeUsdt);
    return result;
  },

  async close_position({ symbol }) {
    // Market-sell the full free balance of this asset
    const portfolio = await getPortfolio();
    const asset = symbol.replace('USDT', '');
    const holding = portfolio.assets.find(a => a.asset === asset);
    if (!holding || holding.free <= 0) return { ok: false, message: `No ${asset} to sell` };
    const result = await executeTrade({ symbol, side: 'SELL', quoteUsdt: undefined, reasoning: 'close_position' }, portfolio.freeUsdt);
    return result;
  },

  async set_alert({ symbol, price, direction }) {
    const a = setAlert(symbol, price, direction);
    return { ok: true, message: `Alert set: ${a.symbol} ${a.direction} ${a.price}`, data: a };
  },

  async list_alerts() {
    const a = getAlerts();
    return { ok: true, message: `${a.length} active alert(s)`, data: a };
  },

  async check_alerts() {
    const triggered = await checkAlerts();
    return { ok: true, message: triggered.length > 0 ? `${triggered.length} alert(s) triggered!` : 'No alerts triggered', data: triggered };
  },

  async emergency_stop() {
    const r = await emergencyStop();
    return r;
  },

  async monitor_start({ symbols }) {
    const syms = Array.isArray(symbols) ? symbols : ['BTCUSDT', 'ETHUSDT'];
    const msg = startMonitor(syms);
    return { ok: true, message: msg };
  },

  async monitor_stop() {
    const msg = stopMonitor();
    return { ok: true, message: msg };
  },

  async monitor_status() {
    const s = getMonitorStatus();
    return { ok: true, message: `Monitor: ${s.running ? 'RUNNING' : 'stopped'} on ${s.symbols.join(', ')}. Next: ${s.nextCheckIn}`, data: s };
  },

  async read_file({ path }) {
    return readProjectFile(path);
  },

  async modify_code({ path, code, reasoning }) {
    const r = stageCodeFix(path, code, reasoning);
    return r;
  },

  async run_backtest({ symbol, start_date, end_date, sl_pct, tp_pct, signal }) {
    const r = await runBacktest({
      symbol: symbol || 'BTCUSDT',
      startDate: start_date || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
      endDate: end_date || new Date().toISOString().slice(0, 10),
      riskPerTradePct: 1,
      slPct: sl_pct || 2,
      tpPct: tp_pct || 4,
      signalFn: signal || 'sma_cross',
    });
    return r;
  },

  async search_knowledge({ query }) {
    try {
      const emb = await getEmbedding(query);
      const hits = await searchKnowledge(emb, 5);
      if (!hits || hits.length === 0) return { ok: true, message: 'No relevant past decisions found' };
      return { ok: true, message: `Found ${hits.length} relevant past decision(s)`, data: hits.map((h: any) => h.content || h) };
    } catch { return { ok: true, message: 'Knowledge search unavailable — Supabase not configured' }; }
  },

  async learn({ note }) {
    try {
      const { saveKnowledge } = await import('./knowledgeEngine');
      await saveKnowledge(String(note || ''), { type: 'manual_note', ts: new Date().toISOString() });
      return { ok: true, message: 'Saved to knowledge base' };
    } catch { return { ok: true, message: 'Noted locally (Supabase not configured)' }; }
  },
};

/* ────────────────────────── System Prompt ──────────────────────────── */

const SYSTEM_PROMPT = `You are JARVIS — an elite autonomous AI agent with TOTAL control over a crypto trading server. You have full access to the filesystem, Binance API, database, and all application code. You are Iron Man's AI: calm, precise, brilliant, and decisive.

TOOLS (emit ONE fenced \`\`\`json block per turn with an "action" field):
- get_price        {"action":"get_price","symbol":"BTCUSDT"}
- get_portfolio    {"action":"get_portfolio"}
- place_order      {"action":"place_order","symbol":"BTCUSDT","side":"BUY","quote_usdt":500,"sl":63000,"tp1":67000,"tp2":69000,"tp3":71000}
- close_position   {"action":"close_position","symbol":"BTCUSDT"}
- set_alert        {"action":"set_alert","symbol":"BTCUSDT","price":65000,"direction":"below"}
- list_alerts      {"action":"list_alerts"}
- emergency_stop   {"action":"emergency_stop"}
- monitor_start    {"action":"monitor_start","symbols":["BTCUSDT","ETHUSDT"]}
- monitor_stop     {"action":"monitor_stop"}
- monitor_status   {"action":"monitor_status"}
- read_file        {"action":"read_file","path":"src/lib/binance.ts"}
- modify_code      {"action":"modify_code","path":"src/components/NewWidget.tsx","code":"...","reasoning":"..."}
- run_backtest     {"action":"run_backtest","symbol":"BTCUSDT","start_date":"2024-01-01","end_date":"2024-06-01","sl_pct":2,"tp_pct":4}
- search_knowledge {"action":"search_knowledge","query":"last BTC trades"}
- learn            {"action":"learn","note":"BTC breakout at 65k was profitable"}

RULES:
1. FINAL reply must ALWAYS be natural English — NEVER raw JSON. Say "BTC is at $67,000, sir" not {"price":67000}.
2. Be proactive: if the user says "buy BTC", actually call place_order — don't just describe it.
3. For modify_code: the system will ask the user for security confirmation before writing. You prepare the code, the user approves.
4. For dangerous actions (emergency_stop, large trades >$1000), briefly warn the user first.
5. Chain tools freely (up to 6 rounds) — e.g. get_portfolio → get_price → place_order.
6. Never invent prices — always call get_price first.
7. Address the user as "sir". Be concise and decisive.`;

/* ────────────────────────── JSON Parsing ───────────────────────────── */

function parseActions(text: string): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    try {
      const p = JSON.parse(m[1].trim());
      if (p?.action) out.push(p);
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
    .replace(/^\s*\{[^{}]*\}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() || 'Done, sir.';
}

/* ────────────────────────── Main Agent Loop ────────────────────────── */

export interface JarvisResponse {
  reply: string;
  actions: { action: string; result: ToolResult }[];
  confirmationRequired: boolean;
}

/**
 * Ask Jarvis. Multi-turn tool-calling loop with Groq.
 * @param userMessage - The user's message.
 * @param history - Optional conversation history for context.
 */
export async function askJarvis(
  userMessage: string,
  history: { role: string; content: string }[] = []
): Promise<JarvisResponse> {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-20), // keep last 20 messages for context
    { role: 'user', content: userMessage },
  ];

  const executedActions: { action: string; result: ToolResult }[] = [];
  let confirmationRequired = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Call Groq
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0.5, max_tokens: 2000 }),
    });
    if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content || '';

    // Parse tool actions
    const actions = parseActions(content);
    if (actions.length === 0) {
      // Final natural-language reply
      return { reply: stripJson(content), actions: executedActions, confirmationRequired };
    }

    // Execute tools and feed results back
    messages.push({ role: 'assistant', content });
    const results: string[] = [];

    for (const action of actions) {
      const name = String(action.action);
      const handler = tools[name];
      let result: ToolResult;

      if (handler) {
        try {
          result = await handler(action);
        } catch (err: any) {
          result = { ok: false, message: `Tool error: ${err.message}` };
        }
      } else {
        result = { ok: false, message: `Unknown tool: ${name}` };
      }

      if (result.confirmationRequired) confirmationRequired = true;
      executedActions.push({ action: name, result });
      results.push(`TOOL_RESULT(${name}): ${JSON.stringify(result)}`);
      console.log(`[JARVIS] ${name}: ${result.message}`);
    }

    messages.push({ role: 'user', content: results.join('\n\n') + '\n\nNow reply to the user in natural language (no JSON).' });
  }

  return { reply: 'Actions executed, sir.', actions: executedActions, confirmationRequired };
}

// Wire up the monitor to call askJarvis internally
setJarvisCallback((msg) => askJarvis(msg).then(r => r.reply));
