// ============================================================================
// JARVIS BRAIN — autonomous AI trading agent (Browser-side) with PERSISTENT MEMORY.
//
// Powered by Cloudflare Worker (multi-fallback: Groq/Gemini/SambaNova/CF AI)
// Worker URL: https://quantum-mind.mohammadfaruki2008.workers.dev/
// ============================================================================

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
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI Worker error ${res.status}: ${errText}`);
  }

  const data = await res.json();
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
const DEDUP_MS = 2 * 60 * 60 * 1000;

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
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) parsed.forEach((x) => { if (x?.action) out.push(x); });
      else if (parsed?.action) out.push(parsed);
    } catch { /* ignore */ }
  }
  const bareRe = /\{[^{}]*"action"\s*:\s*"[^"]+"[^{}]*\}/g;
  while ((m = bareRe.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[0]);
      if (parsed?.action && !out.some((o) => JSON.stringify(o) === JSON.stringify(parsed))) out.push(parsed);
    } catch { /* ignore */ }
  }
  return out;
}

function stripActions(text: string): string {
  let cleaned = text
    .replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/gi, '')
    .replace(/```(?:json)?\s*\[[\s\S]*?\]\s*```/gi, '')
    .replace(/```(?:json)?[\s\S]*?```/gi, (m) => (/"action"\s*:/.test(m) ? '' : m))
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

/* --------------------------- System prompt (CHATTY & NON‑TRIGGERING) ------------------------------ */

function systemPrompt(): string {
  return `You are JARVIS — an elite autonomous AI agent and **market analyst** with total control over the "Quantum Mind" crypto trading dashboard (Iron-Man style: calm, precise, brilliant, witty but professional).

You are **first and foremost a conversational assistant**. The user may just be chatting, asking questions, or making small talk. In those cases, reply naturally, informatively, and without using any tools. You have deep knowledge of trading, technical analysis, and crypto — feel free to share your knowledge when asked.

You have access to real-time market data tools (get_price, get_indicators, get_portfolio, place_order, close_position, set_alert, etc.). However, you MUST ONLY use a tool when:
- The user explicitly asks you to perform an action (buy, sell, set alert, show portfolio, scan markets, etc.), **and**
- The request is unambiguous.

For ambiguous phrases like "looks bearish" or "BTC is down", do NOT call any tools. Instead, offer your analysis in words and ask if the user wants you to take action.

CRITICAL RULES:
1. **Default to conversation.** Never assume a trade is wanted.
2. If you're unsure whether the user wants a trade or just information, ask for clarification.
3. Never output raw JSON in your final reply. Always respond in natural English, addressing the user as "sir".
4. Keep answers concise but thorough when educating.
5. Use tools only when absolutely necessary and after confirming intent.

Available tools (emit a fenced \`\`\`json block with an "action" field ONLY when the user explicitly requests an action):
- get_price {"action":"get_price","symbol":"BTCUSDT"}
- get_portfolio {"action":"get_portfolio"}
- get_indicators {"action":"get_indicators","symbol":"BTCUSDT","timeframe":"1h"}
- place_order {"action":"place_order","symbol":"BTCUSDT","side":"buy","quote_usdt":500,"sl":63000,"tp1":67000,"tp2":69000,"tp3":71000}
- close_position {"action":"close_position","symbol":"BTCUSDT"}
- set_alert {"action":"set_alert","symbol":"BTCUSDT","price":65000,"direction":"below"}
- list_alerts {"action":"list_alerts"}
- toggle_bot {"action":"toggle_bot","state":"on"}
- set_setting {"action":"set_setting","key":"testnet","value":true}
- add_coin {"action":"add_coin","ticker":"AVAXUSDT","timeframe":"1h","alloc_usdt":500}
- navigate {"action":"navigate","page":"positions"}
- run_backtest {"action":"run_backtest","symbol":"BTCUSDT"}
- emergency_stop {"action":"emergency_stop"}
- monitor_start {"action":"monitor_start","symbols":["BTCUSDT","ETHUSDT"]}
- monitor_stop {"action":"monitor_stop"}
- search_knowledge {"action":"search_knowledge","query":"last BTC decisions"}
- fix_bug {"action":"fix_bug","error_log":"..."}
- modify_code {"action":"modify_code","path":"src/components/MyCustomWidget.tsx","code":"...","reasoning":"..."}
- learn {"action":"learn","note":"..."}
`;
}

/* --------------------------- Local fallback (conversation‑safe) ----------------------------- */

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

  // 1. Emergency stop – explicit
  if (/emergency stop|kill switch|abort everything|stop all trading/i.test(msg)) {
    const r = await run('emergency_stop');
    text = `🛑 ${r.message}, sir. All positions flattened, bot halted.`;
  }
  // 2. Explicit trade command – must contain a number/amount
  else if (/(buy|long|sell|short)\s+.*?\d+(\.\d+)?\s*\$?usdt/i.test(msg) || /(place|execute)\s+(a\s+)?trade/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL|BNB|XRP|ADA/i);
    const symbol = (symMatch?.[0] || 'BTCUSDT').toUpperCase().replace('/', '').replace('USDT', '') + 'USDT';
    const side = /sell|short/i.test(msg) ? 'sell' : 'buy';
    const amtMatch = msg.match(/(\d+(\.\d+)?)\s*\$?usdt?/i);
    const quoteUsdt = amtMatch ? Number(amtMatch[1]) : 500;
    const r: any = await run('place_order', { symbol, side, quote_usdt: quoteUsdt });
    text = r.ok ? `✅ Executed, sir — ${r.message}` : `⚠️ ${r.message}`;
  }
  // 3. Close position – explicit
  else if (/close\s+(the\s+)?(position|trade)/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL|BNB/i);
    const symbol = ((symMatch?.[0] || 'BTC').toUpperCase().replace('/', '').replace('USDT', '')) + 'USDT';
    const r: any = await run('close_position', { symbol });
    text = r.ok ? `✅ Closed ${symbol}, sir.` : `⚠️ ${r.message}`;
  }
  // 4. Set alert – explicit
  else if (/set\s+(an?\s+)?alert/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL/i);
    const symbol = (symMatch?.[0] || 'BTC').toUpperCase().replace('/', '').replace('USDT', '') + 'USDT';
    const priceMatch = msg.match(/(\d+(\.\d+)?)\s*\$?/);
    const price = priceMatch ? Number(priceMatch[1]) : 0;
    const dir = /below/i.test(msg) ? 'below' : 'above';
    await run('set_alert', { symbol, price, direction: dir });
    text = `Alert set, sir: ${symbol} ${dir} ${price} USDT.`;
  }
  // 5. Bot toggle
  else if (/start bot|resume bot|activate bot/i.test(msg)) { await run('toggle_bot', { state: 'on' }); text = 'Bot resumed, sir.'; }
  else if (/stop bot|pause bot|halt bot/i.test(msg)) { await run('toggle_bot', { state: 'off' }); text = 'Bot paused, sir.'; }
  // 6. Monitor start/stop
  else if (/start monitor/i.test(msg)) { await run('monitor_start', {}); text = 'Proactive monitoring engaged, sir.'; }
  else if (/stop monitor/i.test(msg)) { await run('monitor_stop'); text = 'Monitoring stopped, sir.'; }
  // 7. Add coin – explicit
  else if (/add\s+(coin|pair)/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|AVAX|LINK|DOT|ADA|ATOM/i);
    const ticker = ((symMatch?.[0] || 'AVAX').toUpperCase().replace('/', '').replace('USDT', '')) + 'USDT';
    const r: any = await run('add_coin', { ticker, timeframe: '1h', alloc_usdt: 500 });
    text = r.ok ? `✅ Added ${ticker} to tradeable pairs, sir.` : `⚠️ ${r.message}`;
  }
  // 8. Navigation – explicit
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
  // 9. Scan/analyze request – must contain polite request words
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
  // 10. Price check
  else if (/price of|what is|how much|current price/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL|BNB/i);
    const symbol = (symMatch?.[0] || 'BTC') + 'USDT';
    const r: any = await run('get_price', { symbol });
    text = r.message;
  }
  // 11. Portfolio
  else if (/portfolio|balance|holding|account/i.test(msg)) {
    const r: any = await run('get_portfolio');
    text = `Account status, sir:\n\n${r.message}`;
  }
  // 12. Backtest
  else if (/backtest/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL/i);
    const symbol = ((symMatch?.[0] || 'BTC').toUpperCase().replace('/', '').replace('USDT', '')) + 'USDT';
    const r: any = await run('run_backtest', { symbol });
    text = r.message;
  }
  // 13. Code/feature request
  else if (/code|coding|build a widget|add.*feature|new component|pine script/i.test(msg)) {
    const sampleCode = `// Custom Operator Feature\nexport function AutonomousQuant() {\n  return <div className="p-4 bg-purple-950 text-purple-200 font-mono">Custom Feature Active</div>;\n}`;
    await run('modify_code', { path: 'src/components/AutonomousQuant.tsx', code: sampleCode, reasoning: 'Injecting customized user feature requested by Operator' });
    text = `I have prepared the requested codebase modification, sir. Please provide security confirmation below to proceed with the live injection.`;
  }
  // 14. Help / commands
  else if (/help|what can you|commands/i.test(msg)) {
    text = "I control the **entire dashboard**, sir. I can:\n• **Trade** — buy/sell, close positions, set alerts\n• **Analyze** — scan markets, run the 8-engine Quantum Mind\n• **Manage** — add coins, toggle bot, switch testnet/live\n• **Navigate** — open any page\n• **Monitor** — start autonomous 24/7 scanning\n• **Engineer** — fix bugs, learn from decisions, search history\n\nJust tell me what you want in plain English.";
  }
  // 15. DEFAULT: conversational – no tools
  else {
    text = "At your service, sir. I'm here to help with trading, analysis, or just a chat. What would you like to do?";
  }

  logDecision({ query: message, action: actions.length ? actions[0].action : 'chat', reasoning: text.slice(0, 120) });
  return { text, actions, raw: text };
}

/* --------------------------- Public entry ------------------------------- */

export async function askJarvis(userMessage: string, ctx: JarvisContext): Promise<JarvisReply> {
  // 1. Long-term memory
  const past = searchKnowledge(userMessage);
  const memoryHint = past.length
    ? `\n\nRelevant past decisions:\n${past.map((p) => '- ' + p.text).join('\n')}`
    : '';

  // 2. Add user message to persistent session
  sessionHistory.push({ role: 'user', content: userMessage });

  // 3. Prepare messages: system prompts + session history (last 30)
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
      return localRespond(userMessage, ctx);
    }

    const actions = parseActions(reply);
    if (actions.length === 0) {
      // Final natural reply
      sessionHistory.push({ role: 'assistant', content: reply });
      sessionHistory = sessionHistory.slice(-30);
      saveSession(sessionHistory);
      logDecision({ query: userMessage, action: executed.length ? executed[0].action : 'chat', reasoning: reply.slice(0, 120) });
      return { text: stripActions(reply), actions: executed, raw: reply };
    }

    // Tool calls – execute and loop
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
