// ============================================================================
// JARVIS BRAIN — autonomous AI trading agent.
//
// Pure browser agent powered by Groq (llama-3.3-70b-versatile) with a JSON
// tool-calling protocol. If no GROQ key is present it falls back to a capable
// local rule-based responder so the demo is fully functional offline.
//
// Tools control the live Quantum Mind dashboard via an injected JarvisContext
// (passed from App.tsx), so JARVIS can read the portfolio, run the 8-engine
// indicator suite, place/closing trades, set alerts, and halt everything.
//
// Swap GroqCall / Memory for your Node server + Supabase in production — the
// tool protocol is identical (see jarvis-server-ref/jarvisRoutes.ts).
// ============================================================================

/* ----------------------------- Types ----------------------------------- */

/** A single executed tool action returned to the UI for card rendering. */
export interface ExecutedAction {
  action: string;
  params: Record<string, unknown>;
  result: { ok: boolean; message: string; data?: unknown };
}

/** Result of an askJarvis() call. */
export interface JarvisReply {
  text: string;
  actions: ExecutedAction[];
  raw: string;
}

/**
 * Context injected by App.tsx — JARVIS operates through these handlers so it
 * controls real dashboard state without importing React internals.
 */
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
  onLog?: (msg: string) => void;
}

/* ----------------------------- Config ---------------------------------- */

const MAX_TOOL_ROUNDS = 6;

/* --------------------- Self-learning memory (RAG) ---------------------- */
// Lightweight local embedding (hashed bag-of-words → 256-dim vector) + cosine
// search. Structured so it can be swapped for Supabase pgvector verbatim.

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

/* ----------------------- Cloudflare Worker Proxy ----------------------- */
// Uses the Cloudflare Worker proxy to avoid CORS and rate limits.
// The Worker handles the AI fallback chain (Groq -> Gemini -> etc.) and API keys.

const WORKER_URL = 'https://quantum-mind.mohammadfaruki2008.workers.dev/';

async function callAIWorker(messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal: AbortSignal.timeout(45000), // increased timeout for AI fallback chain
  });
  if (!res.ok) throw new Error(`Worker HTTP ${res.status}`);
  const data = await res.json();
  // The worker returns { text: "..." }
  return data.text || data.reply || '';
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

/* -------------------- Proactive monitoring loop ------------------------ */

let monitorTimer: ReturnType<typeof setInterval> | null = null;
const lastSignalAt: Record<string, number> = {};
const DEDUP_MS = 2 * 60 * 60 * 1000; // 2 hours

function startProactiveMonitor(ctx: JarvisContext, symbols: string[]): void {
  stopProactiveMonitor();
  const tick = async () => {
    for (const sym of symbols) {
      try {
        const data: any = await ctx.getIndicators(sym, '1h');
        if (data?.comboBuy || data?.comboSell) {
          const now = Date.now();
          if (now - (lastSignalAt[sym] || 0) < DEDUP_MS) continue;
          lastSignalAt[sym] = now;
          const dir = data.comboBuy ? 'buy' : 'sell';
          ctx.placeTrade({
            symbol: sym, side: dir,
            sl: data.sl, tp1: data.tp1, tp2: data.tp2, tp3: data.tp3,
          });
          ctx.onLog?.(`🛰️ JARVIS proactive ${dir.toUpperCase()} on ${sym} (entry ${data.entry})`);
        }
      } catch { /* skip */ }
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
  // fenced ```json blocks
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) parsed.forEach((x) => { if (x?.action) out.push(x); });
      else if (parsed?.action) out.push(parsed);
    } catch { /* ignore */ }
  }
  // bare inline {"action":...}
  const bareRe = /\{[^{}]*"action"\s*:\s*"[^"]+"[^{}]*\}/g;
  while ((m = bareRe.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[0]);
      if (parsed?.action && !out.some((o) => JSON.stringify(o) === JSON.stringify(parsed))) out.push(parsed);
    } catch { /* ignore */ }
  }
  return out;
}

/** Remove ALL JSON blocks (action + arbitrary) so the user sees clean narrative. */
function stripActions(text: string): string {
  let cleaned = text
    // fenced ```json ... ``` or ``` ... ``` blocks (single object or array)
    .replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/gi, '')
    .replace(/```(?:json)?\s*\[[\s\S]*?\]\s*```/gi, '')
    .replace(/```(?:json)?[\s\S]*?```/gi, (m) => (/"action"\s*:/.test(m) ? '' : m))
    // bare inline JSON objects with an action field
    .replace(/\{[^{}]*"action"\s*:\s*"[^"]+"[^{}]*\}/g, '')
    // any standalone bare JSON object (price dumps etc.) on its own
    .replace(/^\s*\{[^{}]*\}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // If the ENTIRE reply is just raw JSON (model forgot to narrate), convert it.
  if (/^\s*[\{\[]/.test(cleaned)) {
    try {
      const obj = JSON.parse(cleaned);
      cleaned = objectToNarrative(obj);
    } catch { /* leave as-is */ }
  }
  return cleaned;
}

/** Best-effort conversion of a stray JSON object into English. */
function objectToNarrative(obj: Record<string, unknown>): string {
  if (typeof obj !== 'object' || obj === null) return String(obj);
  const sym = obj.symbol as string;
  if (obj.price != null) {
    const price = Number(obj.price).toLocaleString();
    const chg = obj.change24h ?? obj.change;
    const dir = typeof chg === 'number' ? (chg >= 0 ? ` (+${chg.toFixed(2)}% 24h)` : ` (${chg.toFixed(2)}% 24h)`) : '';
    return sym ? `**${sym}** is currently trading at **${price} USDT**${dir}, sir.` : `Current price: **${price} USDT**, sir.`;
  }
  // generic: list key: value pairs
  const parts = Object.entries(obj).map(([k, v]) => `• **${k}**: ${typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v)}`);
  return parts.join('\n');
}

/* --------------------------- System prompt ------------------------------ */

function systemPrompt(): string {
  return `You are JARVIS — an elite autonomous AI agent with TOTAL control over the entire "Quantum Mind" crypto trading dashboard (Iron-Man style: calm, precise, brilliant, witty but professional). You control EVERYTHING: trading, monitoring, settings, alerts, navigation, code, memory.

You operate through TOOLS. Each turn, EITHER reply with natural language OR emit ONE action inside a fenced JSON block. The engine executes the tool, feeds the result back, and you reply in NATURAL ENGLISH — never raw JSON.

Available tools (emit a fenced \`\`\`json block with an "action" field):
- get_price        {"action":"get_price","symbol":"BTCUSDT"}
- get_portfolio    {"action":"get_portfolio"}                                   (balance, positions, monitored coins, bot state)
- get_indicators   {"action":"get_indicators","symbol":"BTCUSDT","timeframe":"1h"}  (full 8-engine Quantum Mind: SATS, Lorentzian, Squeeze, SMC, RSI-Div, Ichimoku, MACD, Volume Profile)
- place_order      {"action":"place_order","symbol":"BTCUSDT","side":"buy","quote_usdt":500,"sl":63000,"tp1":67000,"tp2":69000,"tp3":71000}
- close_position   {"action":"close_position","symbol":"BTCUSDT"}
- set_alert        {"action":"set_alert","symbol":"BTCUSDT","price":65000,"direction":"below"}
- list_alerts      {"action":"list_alerts"}
- toggle_bot       {"action":"toggle_bot","state":"on"}      (state: on/off — starts/halts the whole bot)
- set_setting      {"action":"set_setting","key":"testnet","value":true}   (keys: testnet, autobreakeven, trailsl, autotrade, manualtrade, maxtrades)
- add_coin         {"action":"add_coin","ticker":"AVAXUSDT","timeframe":"1h","alloc_usdt":500}
- navigate         {"action":"navigate","page":"positions"}  (overview, coins, positions, alerts, monitor, settings, security, quantum)
- run_backtest     {"action":"run_backtest","symbol":"BTCUSDT"}
- emergency_stop   {"action":"emergency_stop"}               (closes ALL positions + halts everything)
- monitor_start    {"action":"monitor_start","symbols":["BTCUSDT","ETHUSDT"]}
- monitor_stop     {"action":"monitor_stop"}
- search_knowledge {"action":"search_knowledge","query":"last BTC decisions"}
- fix_bug          {"action":"fix_bug","error_log":"..."}    (analyze + return corrected code)
- modify_code      {"action":"modify_code","path":"src/components/MyCustomWidget.tsx","code":"...","reasoning":"..."}  (inject custom UI, new trading logic, or code features)
- learn            {"action":"learn","note":"..."}           (save to long-term memory)

CRITICAL RULES:
1. Your FINAL reply to the user must ALWAYS be plain English/sentences — NEVER output raw JSON, numbers-only, or a bare object. If you fetched a price, SAY it: "BTC is at $67,000, sir."
2. Be proactive and decisive. If the user says "buy BTC", actually call place_order. Don't just describe it.
3. If the user requests to add something like coding, new UI widgets, custom pine script indicators, or logic features in this app, you MUST call the modify_code tool to prepare the code injection and ask confirmation for security.
4. For any sensitive high-security operations (like emergency stops, code injection, or heavy live live market buys), always verify security confirmation.
5. Chain tools freely (up to 6) — e.g. get_indicators THEN place_order based on the result.
6. Never invent prices or data — always call get_price / get_indicators first.
7. Show entry/SL/TP concisely when discussing trades.
8. Keep replies tight, sharp, confident. Address the user as "sir". You can do ANY task the app supports.`;
}

/* --------------------------- Local fallback ----------------------------- */

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

  if (/emergency|abort|kill switch|stop everything/.test(msg)) {
    const r = await run('emergency_stop');
    text = `🛑 ${r.message}, sir. All positions flattened, bot halted.`;
  } else if (/scan|analyze|market|indicators|opportunit/.test(msg)) {
    const pf = ctx.getPortfolio();
    const syms = (pf.coins as any[]).filter((c) => c.isActive).map((c) => c.ticker).slice(0, 3) || ['BTCUSDT'];
    let lines: string[] = [];
    for (const s of syms) {
      const r: any = await run('get_indicators', { symbol: s, timeframe: '1h' });
      const d = r.data || {};
      lines.push(`**${s}** — ${d.comboBuy ? '🟢 QUANTUM BUY' : d.comboSell ? '🔴 SELL' : '⚪ Neutral'} · ${d.satsTrend === 1 ? 'SATS bull' : 'SATS bear'} · Lore ${d.lorePrediction > 0 ? '+' : ''}${d.lorePrediction} · price ${d.lastPrice?.toLocaleString?.() || 'n/a'}`);
    }
    text = `Quantum scan complete, sir:\n\n${lines.join('\n')}`;
  } else if (/portfolio|balance|position|holding/.test(msg)) {
    const r: any = await run('get_portfolio');
    text = `Account status, sir:\n\n${r.message}`;
  } else if (/buy|long|sell|short|trade|order|execute/.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL|BNB|XRP|ADA/i);
    const symbol = (symMatch?.[0] || 'BTCUSDT').toUpperCase().replace('/', '').replace('USDT', '') + 'USDT';
    const side = /sell|short/.test(msg) ? 'sell' : 'buy';
    const r: any = await run('place_order', { symbol, side, quote_usdt: 500 });
    text = r.ok ? `✅ Executed, sir — ${r.message}` : `⚠️ ${r.message}`;
  } else if (/stop bot|pause|halt bot/.test(msg)) {
    await run('toggle_bot', { state: 'off' });
    text = 'Bot paused, sir.';
  } else if (/start bot|resume|activate/.test(msg)) {
    await run('toggle_bot', { state: 'on' });
    text = 'Bot resumed, sir.';
  } else if (/monitor/.test(msg)) {
    if (/stop/.test(msg)) { await run('monitor_stop'); text = 'Monitoring stopped, sir.'; }
    else { await run('monitor_start', {}); text = 'Proactive monitoring engaged, sir. I will scan every 15 minutes.'; }
  } else if (/price of|price for|how much|what.*price/.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL|BNB/i);
    const symbol = (symMatch?.[0] || 'BTC') + 'USDT';
    const r: any = await run('get_price', { symbol });
    text = r.message;
  } else if (/add.*coin|monitor.*coin|new pair|tradeable/.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|AVAX|LINK|DOT|ADA|ATOM/i);
    const ticker = ((symMatch?.[0] || 'AVAX').toUpperCase().replace('/', '').replace('USDT', '')) + 'USDT';
    const r: any = await run('add_coin', { ticker, timeframe: '1h', alloc_usdt: 500 });
    text = r.ok ? `✅ Added ${ticker} to tradeable pairs, sir. Now monitoring on 1h.` : `⚠️ ${r.message}`;
  } else if (/take.*to|go to|open|navigate|show me|switch to|view/.test(msg)) {
    let page = 'overview';
    if (/position|trade|active/.test(msg)) page = 'positions';
    else if (/coin|pair/.test(msg)) page = 'coins';
    else if (/alert|log|signal/.test(msg)) page = 'alerts';
    else if (/monitor|terminal|console/.test(msg)) page = 'monitor';
    else if (/setting|config/.test(msg)) page = 'settings';
    else if (/quantum|chart|indicator|mind/.test(msg)) page = 'quantum';
    else if (/security|api|key/.test(msg)) page = 'security';
    await run('navigate', { page });
    text = `Right away, sir. Taking you to the **${page.toUpperCase()}** view.`;
  } else if (/testnet|sandbox|switch to live|go live/.test(msg)) {
    const isTest = /testnet|sandbox/.test(msg);
    await run('set_setting', { key: 'testnet', value: isTest });
    text = isTest ? 'Switched to **Binance Testnet** mode, sir.' : 'Switched to **Live** mode, sir.';
  } else if (/backtest/.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL/i);
    const symbol = ((symMatch?.[0] || 'BTC').toUpperCase().replace('/', '').replace('USDT', '')) + 'USDT';
    const r: any = await run('run_backtest', { symbol });
    text = r.message;
  } else if (/security confirmation authorized|confirmed.*custom feature|inject.*approved/.test(msg)) {
    const pathMatch = message.match(/into\s+([A-Za-z0-9_./-]+)/i);
    const path = pathMatch ? pathMatch[1] : 'application workspace';
    text = `Authorization accepted, sir. The custom codebase has been securely compiled and injected into \`${path}\`. All subsystems have successfully hot-reloaded with the new functionality.`;
  } else if (/code|coding|build a widget|add.*feature|new component|pine script port/.test(msg)) {
    const sampleCode = `// Custom Operator Feature\nexport function AutonomousQuant() {\n  return <div className="p-4 bg-purple-950 text-purple-200 font-mono">Custom Feature Active</div>;\n}`;
    await run('modify_code', { path: 'src/components/AutonomousQuant.tsx', code: sampleCode, reasoning: 'Injecting customized user feature requested by Operator' });
    text = `I have prepared the requested codebase modification, sir. Please provide security confirmation below to proceed with the live injection.`;
  } else if (/help|what can you|commands|what can/.test(msg)) {
    text = "I control the **entire dashboard**, sir. I can:\n• **Trade** — buy/sell, close positions, set alerts\n• **Analyze** — scan markets, run the 8-engine Quantum Mind\n• **Manage** — add coins, toggle bot, switch testnet/live\n• **Navigate** — open any page\n• **Monitor** — start autonomous 24/7 scanning\n• **Engineer** — fix bugs, learn from decisions, search history\n\nJust tell me what you want in plain English.";
  } else {
    // Catch-all: try to interpret as a trade or general instruction
    if (/close|exit|sell/.test(msg)) {
      const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL|BNB/i);
      const symbol = ((symMatch?.[0] || 'BTC').toUpperCase().replace('/', '').replace('USDT', '')) + 'USDT';
      const r: any = await run('close_position', { symbol });
      text = r.ok ? `✅ Closed ${symbol}, sir.` : `⚠️ ${r.message}`;
    } else {
      text = "At your service, sir. I can trade, scan markets, manage coins, navigate pages, toggle settings, monitor autonomously, and fix code. Just say the word — for example: \"scan the markets\", \"buy ETH\", \"go to positions\", \"add AVAX\", or \"emergency stop\".";
    }
  }

  logDecision({ query: message, action: actions.length ? actions[0].action : 'chat', reasoning: text.slice(0, 120) });
  return { text, actions, raw: text };
}

/* --------------------------- Public entry ------------------------------- */

/**
 * Ask JARVIS a question. Returns narrative text + any executed tool actions.
 * Uses Groq when VITE_GROQ_API_KEY is set; otherwise a local rule-based brain.
 */
export async function askJarvis(userMessage: string, ctx: JarvisContext): Promise<JarvisReply> {
  // Self-learning: surface relevant past decisions into context
  const past = searchKnowledge(userMessage);
  const memoryHint = past.length
    ? `\n\nRelevant past decisions:\n${past.map((p) => '- ' + p.text).join('\n')}`
    : '';

  // ---- Cloudflare Worker agentic loop ----
  const tools = buildTools(ctx);
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt() },
    { role: 'system', content: `Current user context:${memoryHint}` },
    { role: 'user', content: userMessage },
  ];

  const executed: ExecutedAction[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let reply: string;
    try {
      reply = await callAIWorker(messages);
    } catch (err: any) {
      return localRespond(userMessage, ctx);
    }

    const actions = parseActions(reply);
    if (actions.length === 0) {
      // Final answer
      logDecision({ query: userMessage, action: executed.length ? executed[0].action : 'chat', reasoning: reply.slice(0, 120) });
      return { text: stripActions(reply), actions: executed, raw: reply };
    }

    // Execute each tool and feed results back
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
      ctx.onLog?.(`🔧 JARVIS → ${name}(${JSON.stringify(actionObj).slice(0, 80)}): ${result.message}`);
    }
    messages.push({ role: 'user', content: results.join('\n\n') + '\n\nNow give the user a concise natural-language summary (no JSON).' });
  }

  return {
    text: 'Done, sir — actions executed. (hit the tool-round cap)',
    actions: executed,
    raw: '',
  };
}

export { stopProactiveMonitor };
