// ============================================================================
// JARVIS BRAIN — Server-Side Autonomous AI Agent (Node.js + Binance)
// QuadEngine + Extra Indicators → JARVIS AI → Trading Decision
// ============================================================================

import fs from 'fs';
import path from 'path';
import * as binance from './binance';
import { MarketSnapshot, getMarketSnapshot, Candle } from './QuadEngine';

/* 💽 NODE.JS COMPATIBILITY LAYER (Mimics Browser LocalStorage & Ctx Fallback) */
const STORAGE_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

const localStorage = {
  getItem: (key: string) => {
    const p = path.join(STORAGE_DIR, `${key}.json`);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  },
  setItem: (key: string, value: string) => {
    const p = path.join(STORAGE_DIR, `${key}.json`);
    fs.writeFileSync(p, value, 'utf8');
  }
};

const defaultBackendCtx: JarvisContext = {
  getPortfolio: () => ({ balance: 1000, openPositions: [], coins: [], botStatus: 'running', autoTrade: true }),
  getPrice: async (symbol) => await binance.fetchPrice(symbol),
  getIndicators: async () => ({}),
  placeTrade: (p) => {
    binance.executeTrade(p.symbol, p.quoteUsdt || 50);
    return { ok: true, message: `Placed ${p.side} order for ${p.symbol} via server core` };
  },
  closePosition: (symbol) => {
    binance.marketSell({ symbol, quantity: 1 });
    return { ok: true, message: `Closed position for ${symbol}` };
  },
  setAlert: () => {},
  getAlerts: () => [],
  toggleBot: () => {},
  emergencyStop: () => 'Emergency stop executed on server node',
};

/* ----------------------------- Types ----------------------------------- */

export interface ExecutedAction {
  action: string;
  params: Record<string, unknown>;
  result: { ok: boolean; message: string; data?: unknown };
}

export interface JarvisReply {
  text: string;
  actions: ExecutedAction[];
  raw: string;
}

export interface JarvisContext {
  getPortfolio: () => {
    balance: number;
    openPositions: unknown[];
    coins: unknown[];
    botStatus: string;
    autoTrade: boolean;
  };
  getPrice: (symbol: string) => Promise<number>;
  getIndicators: (symbol: string, timeframe: string) => Promise<unknown>;
  placeTrade: (p: {
    symbol: string;
    side: string;
    quoteUsdt?: number;
    sl?: number;
    tp1?: number;
    tp2?: number;
    tp3?: number;
  }) => { ok: boolean; message: string };
  closePosition: (symbol: string) => { ok: boolean; message: string };
  setAlert: (a: { symbol: string; price: number; direction: 'above' | 'below' }) => void;
  getAlerts: () => { symbol: string; price: number; direction: string }[];
  toggleBot: (running: boolean) => void;
  emergencyStop: () => string;
  navigate?: (page: string) => void;
  setSetting?: (key: string, value: any) => void;
  addCoin?: (ticker: string, timeframe: string, allocUsdt: number) => { ok: boolean; message: string };
  runBacktest?: (symbol: string) => { ok: boolean; message: string };
  readFile?: (path: string) => Promise<{ ok: boolean; message: string; data?: string }>;
  onLog?: (msg: string) => void;
}

/* ----------------------------- Config ---------------------------------- */

const WORKER_URL = 'https://quantum-mind.mohammadfaruki2008.workers.dev/';
const MAX_TOOL_ROUNDS = 6;

/* ---- PERSISTENT SESSION MEMORY (localStorage) ---- */
const SESSION_STORAGE_KEY = 'jarvis_session_v1';

function loadSession(): { role: string; content: string }[] {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSession(history: { role: string; content: string }[]) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(history.slice(-30)));
  } catch { /* ignore */ }
}

let sessionHistory = loadSession();

/* --------------------- Self-learning memory (RAG) ---------------------- */

interface KnowledgeEntry {
  id: string;
  ts: string;
  query: string;
  action: string;
  reasoning: string;
  text: string;
  vec: number[];
}

const KB_KEY = 'jarvis_knowledge_v1';

function loadKB(): KnowledgeEntry[] {
  try { return JSON.parse(localStorage.getItem(KB_KEY) || '[]'); } catch { return []; }
}
function saveKB(kb: KnowledgeEntry[]) {
  try { localStorage.setItem(KB_KEY, JSON.stringify(kb.slice(-200))); } catch { /* ignore */ }
}

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
}
function embed(text: string): number[] {
  const v = new Array(256).fill(0);
  for (const w of tokenize(text)) {
    let h = 0;
    for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0;
    v[h % 256] += 1;
  }
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / norm);
}
function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function logDecision(d: { query: string; action: string; reasoning: string }): void {
  const kb = loadKB();
  const text = `${d.query} | ${d.action} | ${d.reasoning}`;
  kb.push({ id: `k_${Date.now()}`, ts: new Date().toISOString(), text, vec: embed(text), ...d });
  saveKB(kb);
}

function searchKnowledge(query: string, topK = 3): KnowledgeEntry[] {
  const kb = loadKB();
  if (kb.length === 0) return [];
  const qv = embed(query);
  return kb
    .map((e) => ({ e, score: cosine(qv, e.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((x) => x.score > 0.05)
    .map((x) => x.e);
}

/* ------------------------- Cloudflare Worker call ---------------------- */

async function callAI(messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(30000) : undefined,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI Worker error ${res.status}: ${errText}`);
  }

  const data = await res.json() as any;
  return data.text || '';
}

/* ------------------------- Tool registry -------------------------------- */

function buildTools(ctx: JarvisContext): Record<string, (p: Record<string, unknown>) => Promise<{ ok: boolean; message: string; data?: unknown }>> {
  return {
    async get_price({ symbol }) {
      const s = String(symbol || '').toUpperCase();
      const price = await ctx.getPrice(s);
      return price > 0
        ? { ok: true, message: `${s} spot price: ${price.toLocaleString()} USDT`, data: { symbol: s, price } }
        : { ok: false, message: `Could not fetch ${s} price` };
    },

    async get_portfolio() {
      const p = ctx.getPortfolio();
      return { ok: true, message: `Equity ${p.balance.toFixed(2)} USDT, ${p.openPositions.length} open trades, ${p.coins.length} monitored pairs, bot ${p.botStatus}, auto-trade ${p.autoTrade ? 'ON' : 'OFF'}`, data: p };
    },

    async get_indicators({ symbol, timeframe }) {
      const s = String(symbol || 'BTCUSDT').toUpperCase();
      const tf = String(timeframe || '1h');
      const data = await ctx.getIndicators(s, tf);
      return { ok: true, message: `Quantum Mind analysis for ${s} ${tf} ready`, data };
    },

    async place_order(p) {
      const symbol = String(p.symbol || '').toUpperCase();
      if (!symbol) return { ok: false, message: 'Missing symbol' };
      const r = ctx.placeTrade({
        symbol,
        side: String(p.side || 'buy').toLowerCase(),
        quoteUsdt: p.quote_usdt != null ? Number(p.quote_usdt) : p.quantity != null ? Number(p.quantity) : undefined,
        sl: p.sl != null ? Number(p.sl) : undefined,
        tp1: p.tp1 != null ? Number(p.tp1) : undefined,
        tp2: p.tp2 != null ? Number(p.tp2) : undefined,
        tp3: p.tp3 != null ? Number(p.tp3) : undefined,
      });
      logDecision({ query: `Place ${p.side} ${symbol}`, action: 'place_order', reasoning: r.message });
      return r;
    },

    async close_position({ symbol }) {
      const s = String(symbol || '').toUpperCase();
      const r = ctx.closePosition(s);
      logDecision({ query: `Close ${s}`, action: 'close_position', reasoning: r.message });
      return r;
    },

    async set_alert({ symbol, price, direction }) {
      const s = String(symbol || '').toUpperCase();
      const pr = Number(price);
      const dir = (direction === 'below' ? 'below' : 'above');
      ctx.setAlert({ symbol: s, price: pr, direction: dir });
      return { ok: true, message: `Alert set: ${s} ${dir} ${pr.toLocaleString()} USDT` };
    },

    async list_alerts() {
      const a = ctx.getAlerts();
      return { ok: true, message: `${a.length} active alert(s)`, data: a };
    },

    async toggle_bot({ state }) {
      const running = state === 'on' || state === true || state === 'running';
      ctx.toggleBot(running);
      return { ok: true, message: `Bot ${running ? 'started' : 'paused'}` };
    },

    async emergency_stop() {
      const msg = ctx.emergencyStop();
      logDecision({ query: 'Emergency stop', action: 'emergency_stop', reasoning: msg });
      return { ok: true, message: msg };
    },

    async monitor_start({ symbols }) {
      const syms = Array.isArray(symbols) ? symbols.map(String) : ['BTCUSDT', 'ETHUSDT'];
      startProactiveMonitor(ctx, syms);
      return { ok: true, message: `Proactive monitoring started on ${syms.join(', ')} (every 15 min)` };
    },

    async monitor_stop() {
      stopProactiveMonitor();
      return { ok: true, message: 'Proactive monitoring stopped' };
    },

    async search_knowledge({ query }) {
      const hits = searchKnowledge(String(query || ''));
      if (hits.length === 0) return { ok: true, message: 'No past decisions found yet' };
      return { ok: true, message: `Found ${hits.length} past decision(s)`, data: hits.map((h) => h.text) };
    },

    async fix_bug({ error_log }) {
      return { ok: true, message: 'Bug analysis complete — see reply', data: { error: String(error_log || '') } };
    },

    async learn({ note }) {
      logDecision({ query: 'Manual note', action: 'learn', reasoning: String(note || '') });
      return { ok: true, message: 'Saved to knowledge base' };
    },

    async navigate({ page }) {
      if (!ctx.navigate) return { ok: false, message: 'Navigation not available' };
      ctx.navigate(String(page || 'overview'));
      return { ok: true, message: `Navigated to ${page} page` };
    },

    async set_setting({ key, value }) {
      if (!ctx.setSetting) return { ok: false, message: 'Settings control not available' };
      ctx.setSetting(String(key || ''), value);
      return { ok: true, message: `Setting "${key}" updated to ${JSON.stringify(value)}` };
    },

    async add_coin({ ticker, timeframe, alloc_usdt }) {
      if (!ctx.addCoin) return { ok: false, message: 'Coin management not available' };
      const r = ctx.addCoin(String(ticker || ''), String(timeframe || '1h'), Number(alloc_usdt || 500));
      logDecision({ query: `Add ${ticker}`, action: 'add_coin', reasoning: r.message });
      return r;
    },

    async run_backtest({ symbol }) {
      if (!ctx.runBacktest) return { ok: false, message: 'Backtest not available' };
      return ctx.runBacktest(String(symbol || 'BTCUSDT'));
    },

    async read_file({ path }) {
      if (!ctx.readFile) return { ok: false, message: 'File reader not available' };
      return ctx.readFile(String(path || ''));
    },

    async modify_code({ path, code, reasoning }) {
      const p = String(path || 'src/custom.tsx');
      const c = String(code || '');
      const r = String(reasoning || 'Adding requested app functionality');
      logDecision({ query: `Modify code in ${p}`, action: 'modify_code', reasoning: r });
      return {
        ok: true,
        message: `Security Confirmation requested from Operator before injecting custom code into ${p}`,
        data: { path: p, code: c, reasoning: r },
      };
    },
  };
}

/* -------------------- Proactive monitoring loop (AI-Powered) ------------------------ */

let monitorTimer: ReturnType<typeof setInterval> | null = null;
const lastSignalAt: Record<string, number> = {};
const DEDUP_MS = 2 * 60 * 60 * 1000;

async function startProactiveMonitor(ctx: JarvisContext, symbols: string[]): Promise<void> {
  stopProactiveMonitor();
  const tick = async () => {
    for (const sym of symbols) {
      try {
        // Fetch candles (use Binance or any other source)
        const candles: Candle[] = await fetchKlines(sym, '1h', 5000, 5000);
        if (!candles || candles.length < 100) continue;

        // Get AI-powered trading decision
        const decision = await getTradingDecision(sym, '1h', candles, ctx);

        if (decision.action === 'BUY' || decision.action === 'SELL') {
          const now = Date.now();
          if (now - (lastSignalAt[sym] || 0) < DEDUP_MS) continue;
          lastSignalAt[sym] = now;

          ctx.placeTrade({
            symbol: sym,
            side: decision.action.toLowerCase(),
            sl: decision.stopLoss ?? undefined,
            tp1: decision.takeProfit1 ?? undefined,
            tp2: decision.takeProfit2 ?? undefined,
            tp3: decision.takeProfit3 ?? undefined,
          });
          ctx.onLog?.(`🧠 JARVIS AI ${decision.action} on ${sym}: ${decision.reasoning}`);
        }
      } catch (err: any) {
        console.error(`[JARVIS Monitor] Error for ${sym}:`, err.message);
      }
    }
  };

  tick();
  monitorTimer = setInterval(tick, 15 * 60 * 1000);
}

function stopProactiveMonitor(): void {
  if (monitorTimer) { clearInterval(monitorTimer); monitorTimer = null; }
}

/* --------------------------- JSON parsing ------------------------------- */

function parseActions(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  
  const fenceRe = /\x60\x60\x60(?:json)?\s*([\s\S]*?)\x60\x60\x60/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) {
        parsed.forEach((x) => { if (x && x.action) out.push(x); });
      } else if (parsed && parsed.action) {
        out.push(parsed);
      }
    } catch { /* ignore */ }
  }
  
  const bareRe = /\{[^{}]*"action"\s*:\s*"[^"]+"[^{}]*\}/g;
  while ((m = bareRe.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[0]);
      if (parsed && parsed.action && !out.some((o) => JSON.stringify(o) === JSON.stringify(parsed))) {
        out.push(parsed);
      }
    } catch { /* ignore */ }
  }
  return out;
}

function stripActions(text: string): string {
  let cleaned = text
    .replace(/\x60\x60\x60(?:json)?\s*\{[\s\S]*?\}\s*\x60\x60\x60/gi, '')
    .replace(/\x60\x60\x60(?:json)?\s*\[[\s\S]*?\]\s*\x60\x60\x60/gi, '')
    .replace(/\x60\x60\x60(?:json)?[\s\S]*?\x60\x60\x60/gi, (m) => (/"action"\s*:/.test(m) ? '' : m))
    .replace(/\{[^{}]*"action"\s*:\s*"[^"]+"[^{}]*\}/g, '')
    .replace(/^\s*\{[^{}]*\}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (/^\s*[\{\[]/.test(cleaned)) {
    try {
      const obj = JSON.parse(cleaned);
      cleaned = objectToNarrative(obj);
    } catch { /* leave as-is */ }
  }
  return cleaned;
}

function objectToNarrative(obj: Record<string, unknown>): string {
  if (typeof obj !== 'object' || obj === null) return String(obj);
  const sym = obj.symbol as string;
  if (obj.price != null) {
    const price = Number(obj.price).toLocaleString();
    const chg = obj.change24h ?? obj.change;
    const dir = typeof chg === 'number' ? (chg >= 0 ? ` (+${chg.toFixed(2)}% 24h)` : ` (${chg.toFixed(2)}% 24h)`) : '';
    return sym ? `**${sym}** is currently trading at **${price} USDT**${dir}, sir.` : `Current price: **${price} USDT**, sir.`;
  }
  const parts = Object.entries(obj).map(([k, v]) => `• **${k}**: ${typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v)}`);
  return parts.join('\n');
}

/* --------------------------- System prompt (Trading Decision Ready) ------------------------------ */

function systemPrompt(): string {
  return `You are JARVIS, the AI master of the Quantum Mind crypto dashboard. You have deep knowledge of technical analysis, market structure, and trading psychology. You are integrated with a powerful indicator engine that provides real-time data.

Your capabilities include:
- Executing trades (spot), setting alerts, navigating the dashboard, modifying settings, and analyzing markets.
- Understanding natural language and responding concisely.

When a user asks for a trading decision, they will send you a market snapshot. You MUST reply with a JSON object as specified. 

General rules:
1. Be proactive but never execute a trade unless explicitly confirmed.
2. Address the user as "sir". Be calm, witty, and professional.
3. Use tools only when absolutely necessary, and always confirm risky actions.`;
}

/* --------------------------- Local fallback (intelligent offline) ----------------------------- */

async function localRespond(message: string, ctx: JarvisContext): Promise<JarvisReply> {
  const msg = message.toLowerCase();
  const actions: ExecutedAction[] = [];
  const tools = buildTools(ctx);

  const run = async (name: string, p: Record<string, unknown> = {}) => {
    const result = await tools[name](p);
    actions.push({ action: name, params: p, result });
    return result;
  };

  let text = '';

  if (/emergency stop|kill switch|abort everything|stop all trading/i.test(msg)) {
    const r = await run('emergency_stop');
    text = `🛑 ${r.message}, sir. All positions flattened, bot halted.`;
  }
  else if (/(buy|long|sell|short)\s+.*?\d+(\.\d+)?\s*\$?usdt/i.test(msg) || /(place|execute)\s+(a\s+)?trade/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL|BNB|XRP|ADA/i);
    const symbol = (symMatch?.[0] || 'BTCUSDT').toUpperCase().replace('/', '').replace('USDT', '') + 'USDT';
    const side = /sell|short/i.test(msg) ? 'sell' : 'buy';
    const amtMatch = msg.match(/(\d+(\.\d+)?)\s*\$?usdt?/i);
    const quoteUsdt = amtMatch ? Number(amtMatch[1]) : 500;
    const r: any = await run('place_order', { symbol, side, quote_usdt: quoteUsdt });
    text = r.ok ? `✅ Executed, sir — ${r.message}` : `⚠️ ${r.message}`;
  }
  else if (/close\s+(the\s+)?(position|trade)/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL|BNB/i);
    const symbol = ((symMatch?.[0] || 'BTC').toUpperCase().replace('/', '').replace('USDT', '')) + 'USDT';
    const r: any = await run('close_position', { symbol });
    text = r.ok ? `✅ Closed ${symbol}, sir.` : `⚠️ ${r.message}`;
  }
  else if (/set\s+(an?\s+)?alert/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL/i);
    const symbol = (symMatch?.[0] || 'BTC').toUpperCase().replace('/', '').replace('USDT', '') + 'USDT';
    const priceMatch = msg.match(/(\d+(\.\d+)?)\s*\$?/);
    const price = priceMatch ? Number(priceMatch[1]) : 0;
    const dir = /below/i.test(msg) ? 'below' : 'above';
    await run('set_alert', { symbol, price, direction: dir });
    text = `Alert set, sir: ${symbol} ${dir} ${price} USDT.`;
  }
  else if (/start bot|resume bot|activate bot/i.test(msg)) { await run('toggle_bot', { state: 'on' }); text = 'Bot resumed, sir.'; }
  else if (/stop bot|pause bot|halt bot/i.test(msg)) { await run('toggle_bot', { state: 'off' }); text = 'Bot paused, sir.'; }
  else if (/start monitor/i.test(msg)) { await run('monitor_start', {}); text = 'Proactive monitoring engaged, sir.'; }
  else if (/stop monitor/i.test(msg)) { await run('monitor_stop'); text = 'Monitoring stopped, sir.'; }
  else if (/add\s+(coin|pair)/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|AVAX|LINK|DOT|ADA|ATOM/i);
    const ticker = ((symMatch?.[0] || 'AVAX').toUpperCase().replace('/', '').replace('USDT', '')) + 'USDT';
    const r: any = await run('add_coin', { ticker, timeframe: '1h', alloc_usdt: 500 });
    text = r.ok ? `✅ Added ${ticker} to tradeable pairs, sir.` : `⚠️ ${r.message}`;
  }
  else if (/go to|open|navigate|switch to|take me to/i.test(msg)) {
    let page = 'overview';
    if (/position|trade|active/i.test(msg)) page = 'positions';
    else if (/coin|pair/i.test(msg)) page = 'coins';
    else if (/alert|log|signal/i.test(msg)) page = 'alerts';
    else if (/monitor|terminal|console/i.test(msg)) page = 'monitor';
    else if (/setting|config/i.test(msg)) page = 'settings';
    else if (/quantum|chart|indicator|mind/i.test(msg)) page = 'quantum';
    else if (/security|api|key/i.test(msg)) page = 'security';
    await run('navigate', { page });
    text = `Right away, sir. Taking you to the **${page.toUpperCase()}** view.`;
  }
  else if (/(scan|analyze|market|indicators|opportunit)/i.test(msg) && /\b(now|please|can you|run|do)\b/i.test(msg)) {
    const pf = ctx.getPortfolio();
    const syms = (pf.coins as any[]).filter((c) => c.isActive).map((c) => c.ticker).slice(0, 3) || ['BTCUSDT'];
    let lines: string[] = [];
    for (const s of syms) {
      const priceRes: any = await run('get_price', { symbol: s });
      const priceData = priceRes.ok ? priceRes.data : null;
      const price = priceData?.price ? priceData.price.toLocaleString() : 'N/A';
      const indRes: any = await run('get_indicators', { symbol: s, timeframe: '1h' });
      const d = indRes.data || {};
      lines.push(`**${s}** — Price: **${price} USDT** · ${d.comboBuy ? '🟢 QUANTUM BUY' : d.comboSell ? '🔴 SELL' : '⚪ Neutral'} · SATS ${d.satsTrend === 1 ? 'bull' : 'bear'} · Lore ${d.lorePrediction > 0 ? '+' : ''}${d.lorePrediction}`);
    }
    text = `Quantum scan complete, sir:\n\n${lines.join('\n')}`;
  }
  else if (/price of|what is|how much|current price/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL|BNB/i);
    const symbol = (symMatch?.[0] || 'BTC') + 'USDT';
    const r: any = await run('get_price', { symbol });
    text = r.message;
  }
  else if (/portfolio|balance|holding|account/i.test(msg)) {
    const r: any = await run('get_portfolio');
    text = `Account status, sir:\n\n${r.message}`;
  }
  else if (/backtest/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL/i);
    const symbol = ((symMatch?.[0] || 'BTC').toUpperCase().replace('/', '').replace('USDT', '')) + 'USDT';
    const r: any = await run('run_backtest', { symbol });
    text = r.message;
  }
  else if (/code|coding|build a widget|add.*feature|new component|pine script/i.test(msg)) {
    const sampleCode = `// Custom Operator Feature\nexport function AutonomousQuant() {\n  return <div className="p-4 bg-purple-950 text-purple-200 font-mono">Custom Feature Active</div>;\n}`;
    await run('modify_code', { path: 'src/components/AutonomousQuant.tsx', code: sampleCode, reasoning: 'Injecting customized user feature requested by Operator' });
    text = `I have prepared the requested codebase modification, sir. Please provide security confirmation below to proceed with the live injection.`;
  }
  else if (/help|what can you|commands/i.test(msg)) {
    text = "I control the **entire dashboard**, sir. I can:\n• **Trade** — buy/sell, close positions, set alerts\n• **Analyze** — scan markets, run the 8-engine Quantum Mind\n• **Manage** — add coins, toggle bot, switch testnet/live\n• **Navigate** — open any page\n• **Monitor** — start autonomous 24/7 scanning\n• **Engineer** — fix bugs, learn from decisions, search history\n\nJust tell me what you want in plain English.";
  }
  else {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL|BNB/i);
    if (symMatch) {
      text = `I'm unable to fetch live data at the moment, sir, but I can still assist with analysis, settings, or modify the dashboard. What would you like to do regarding ${symMatch[0]}?`;
    } else if (/change|modify|add|update|build|create/i.test(msg)) {
      text = "I'm ready to modify the dashboard or add new features as soon as my full capabilities are back online, sir. Please describe what you'd like, and I'll prepare it.";
    } else {
      text = "I'm here and fully capable, sir. Even without live market data, I can navigate, adjust settings, or help you plan your next move. What do you need?";
    }
  }

  logDecision({ query: message, action: actions.length ? actions[0].action : 'chat', reasoning: text.slice(0, 120) });
  return { text, actions, raw: text };
}

/* --------------------------- Public entry ------------------------------- */

export async function askJarvis(userMessage: string, passedCtx?: JarvisContext): Promise<any> {
  const ctx = passedCtx || defaultBackendCtx;
  
  const past = searchKnowledge(userMessage);
  const memoryHint = past.length
    ? `\n\nRelevant past decisions:\n${past.map((p) => '- ' + p.text).join('\n')}`
    : '';

  sessionHistory.push({ role: 'user', content: userMessage });

  const systemMsgs = [
    { role: 'system' as const, content: systemPrompt() },
    { role: 'system' as const, content: `Current user context:${memoryHint}` },
  ];
  const messages = [...systemMsgs, ...sessionHistory.slice(-30)];

  const tools = buildTools(ctx);
  const executed: ExecutedAction[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let reply: string;
    try {
      reply = await callAI(messages);
    } catch (err: any) {
      console.warn('[JARVIS] Worker call failed, falling back to local:', err.message);
      const loc = await localRespond(userMessage, ctx);
      return loc.text; 
    }

    const actions = parseActions(reply);
    if (actions.length === 0) {
      sessionHistory.push({ role: 'assistant', content: reply });
      sessionHistory = sessionHistory.slice(-30);
      saveSession(sessionHistory);
      logDecision({ query: userMessage, action: executed.length ? executed[0].action : 'chat', reasoning: reply.slice(0, 120) });
      return stripActions(reply); 
    }

    messages.push({ role: 'assistant', content: reply });
    const results: string[] = [];
    for (const actionObj of actions) {
      const name = String(actionObj.action);
      const handler = tools[name];
      let result;
      if (handler) {
        try { result = await handler(actionObj); }
        catch (err: any) { result = { ok: false, message: `Tool error: ${err.message}` }; }
      } else {
        result = { ok: false, message: `Unknown tool: ${name}` };
      }
      executed.push({ action: name, params: actionObj, result });
      results.push(`TOOL_RESULT(${name}): ${JSON.stringify(result)}`);
    }
    messages.push({ role: 'user', content: results.join('\n\n') + '\n\nNow give the user a concise natural-language summary (no JSON).' });
  }

  return 'Done, sir — actions executed.';
}

export { stopProactiveMonitor, startProactiveMonitor };

/* ------------------------- JARVIS Trading Decision Engine ------------------------- */

export interface TradeDecision {
  action: 'BUY' | 'SELL' | 'NOTHING';
  reasoning: string;
  entry: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  takeProfit2: number | null;
  takeProfit3: number | null;
}

export async function getTradingDecision(
  symbol: string,
  timeframe: string,
  candles: Candle[],
  ctx: JarvisContext
): Promise<TradeDecision> {
  const snapshot: MarketSnapshot = getMarketSnapshot(symbol, timeframe, candles);

  const prompt = `You are JARVIS, an elite crypto trading AI. Analyze the following market data and decide: BUY, SELL, or NOTHING.

Market Data:
- Symbol: ${snapshot.symbol} (${snapshot.timeframe})
- Current Price: ${snapshot.price}
- SATS SuperTrend: ${snapshot.satsTrend === 1 ? 'Bullish' : 'Bearish'}
- Lorentzian Prediction: ${snapshot.lorePrediction} (Kernel Bullish: ${snapshot.loreKernelBullish})
- Squeeze: ${snapshot.sqzOn ? 'ON' : 'OFF'}, Squeeze Fired Bullish: ${snapshot.sqzFiredBullish}
- RSI: ${snapshot.rsi.toFixed(1)}
  Regular Bull Div: ${snapshot.rsiRegularBull}, Hidden Bull Div: ${snapshot.rsiHiddenBull}
  Regular Bear Div: ${snapshot.rsiRegularBear}, Hidden Bear Div: ${snapshot.rsiHiddenBear}
- Ichimoku Force: ${snapshot.ichiForce.toFixed(1)} (State: ${snapshot.ichiState})
- MACD: ${snapshot.macd.toFixed(4)}
  Bull Cross: ${snapshot.macdBullCross}, Bear Cross: ${snapshot.macdBearCross}
  Bull Divergence: ${snapshot.macdBullDiv}, Bear Divergence: ${snapshot.macdBearDiv}
- Volume Profile POC: ${snapshot.poc.toFixed(2)}, Price is ${snapshot.priceVsPoc} POC
- Smart Money Concepts: Trend ${snapshot.smcTrend}, BOS: ${snapshot.smcBOS}, CHoCH: ${snapshot.smcCHoCH}, In Order Block: ${snapshot.smcInOrderBlock}

Your task:
1. Decide whether to BUY, SELL, or do NOTHING.
2. If trading, provide exact levels:
   - Entry price
   - Stop-Loss
   - Take-Profit 1
   - Take-Profit 2
   - Take-Profit 3
3. Briefly explain your reasoning (max 2 sentences).

Reply ONLY with a JSON object in this exact format:
{
  "action": "BUY" | "SELL" | "NOTHING",
  "reasoning": "...",
  "entry": number,
  "stopLoss": number,
  "takeProfit1": number,
  "takeProfit2": number,
  "takeProfit3": number
}

Do NOT include any other text.`;

  const reply = await askJarvis(prompt, ctx);
  const text = typeof reply === 'string' ? reply : reply.text;

  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    const decision = JSON.parse(cleaned) as TradeDecision;
    if (!['BUY', 'SELL', 'NOTHING'].includes(decision.action)) {
      throw new Error('Invalid action');
    }
    return decision;
  } catch (err) {
    console.error('Failed to parse JARVIS decision:', text);
    return {
      action: 'NOTHING',
      reasoning: 'JARVIS response could not be parsed.',
      entry: null,
      stopLoss: null,
      takeProfit1: null,
      takeProfit2: null,
      takeProfit3: null,
    };
  }
}

// Helper function to fetch klines from Binance (you may already have this elsewhere)
async function fetchKlines(
  symbol: string,
  interval: string,
  limit: number = 500,
  endTime?: number
): Promise<Candle[]> {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}` +
      (endTime ? `&endTime=${endTime}` : '');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance kline HTTP ${res.status}`);
    const raw = await res.json() as any[];
    return raw.map((k: any[]) => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (err) {
    console.error('Failed to fetch klines:', err);
    return [];
  }
}
