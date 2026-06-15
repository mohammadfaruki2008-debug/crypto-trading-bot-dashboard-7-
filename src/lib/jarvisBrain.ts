// ============================================================================
// JARVIS BRAIN – complete working version with all functions
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

// ---- SESSION MEMORY ----
const SESSION_STORAGE_KEY = 'jarvis_session_v1';
function loadSession() { try { return JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]'); } catch { return []; } }
function saveSession(h: { role: string; content: string }[]) { localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(h.slice(-30))); }
let sessionHistory: { role: string; content: string }[] = loadSession();

// ---- RAG Knowledge ----
interface KnowledgeEntry { id: string; ts: string; query: string; action: string; reasoning: string; text: string; vec: number[] }
const KB_KEY = 'jarvis_knowledge_v1';
function loadKB(): KnowledgeEntry[] { try { return JSON.parse(localStorage.getItem(KB_KEY) || '[]'); } catch { return []; } }
function saveKB(kb: KnowledgeEntry[]) { localStorage.setItem(KB_KEY, JSON.stringify(kb.slice(-200))); }
function tokenize(s: string): string[] { return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2); }
function embed(text: string): number[] {
  const v = new Array(256).fill(0);
  for (const w of tokenize(text)) { let h = 0; for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0; v[h % 256] += 1; }
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map(x => x / norm);
}
function cosine(a: number[], b: number[]): number { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function logDecision(d: { query: string; action: string; reasoning: string }) {
  const kb = loadKB(); const text = `${d.query} | ${d.action} | ${d.reasoning}`;
  kb.push({ id: `k_${Date.now()}`, ts: new Date().toISOString(), text, vec: embed(text), ...d }); saveKB(kb);
}
function searchKnowledge(query: string, topK = 3) {
  const kb = loadKB(); if (!kb.length) return [];
  const qv = embed(query); return kb.map(e => ({ e, score: cosine(qv, e.vec) })).sort((a, b) => b.score - a.score).slice(0, topK).filter(x => x.score > 0.05).map(x => x.e);
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
    throw new Error(`Worker error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(`Worker backend error: ${data.error}`);
  return data.text || '';
}

/* ------------------------- Tool registry -------------------------------- */
function buildTools(ctx: JarvisContext): Record<string, (p: Record<string, unknown>) => Promise<{ ok: boolean; message: string; data?: unknown }>> {
  return {
    get_price: async ({ symbol }) => { const s = String(symbol).toUpperCase(); const price = await ctx.getPrice(s); return price > 0 ? { ok: true, message: `${s}: ${price.toLocaleString()} USDT`, data: { symbol: s, price } } : { ok: false, message: `Price not available` }; },
    get_portfolio: async () => { const p = ctx.getPortfolio(); return { ok: true, message: `Balance: ${p.balance.toFixed(2)} USDT, ${p.openPositions.length} positions`, data: p }; },
    get_indicators: async ({ symbol, timeframe }: any) => { const s = String(symbol || 'BTCUSDT').toUpperCase(); const data = await ctx.getIndicators(s, timeframe || '1h'); return { ok: true, message: `Indicators for ${s}`, data }; },
    place_order: async (p: any) => {
      const symbol = String(p.symbol || '').toUpperCase(); if (!symbol) return { ok: false, message: 'Missing symbol' };
      const r = ctx.placeTrade({ symbol, side: String(p.side || 'buy').toLowerCase(), quoteUsdt: p.quote_usdt != null ? Number(p.quote_usdt) : undefined, sl: p.sl != null ? Number(p.sl) : undefined, tp1: p.tp1 != null ? Number(p.tp1) : undefined, tp2: p.tp2 != null ? Number(p.tp2) : undefined, tp3: p.tp3 != null ? Number(p.tp3) : undefined });
      logDecision({ query: `Place ${p.side} ${symbol}`, action: 'place_order', reasoning: r.message }); return r;
    },
    close_position: async ({ symbol }: any) => { const s = String(symbol).toUpperCase(); const r = ctx.closePosition(s); logDecision({ query: `Close ${s}`, action: 'close_position', reasoning: r.message }); return r; },
    set_alert: async ({ symbol, price, direction }: any) => { ctx.setAlert({ symbol: String(symbol).toUpperCase(), price: Number(price), direction: direction === 'below' ? 'below' : 'above' }); return { ok: true, message: `Alert set: ${symbol} ${direction} ${price}` }; },
    list_alerts: async () => { const a = ctx.getAlerts(); return { ok: true, message: `${a.length} alerts`, data: a }; },
    toggle_bot: async ({ state }: any) => { const running = state === 'on' || state === true; ctx.toggleBot(running); return { ok: true, message: `Bot ${running ? 'started' : 'paused'}` }; },
    emergency_stop: async () => { const msg = ctx.emergencyStop(); logDecision({ query: 'Emergency stop', action: 'emergency_stop', reasoning: msg }); return { ok: true, message: msg }; },
    monitor_start: async ({ symbols }: any) => { const syms = Array.isArray(symbols) ? symbols.map(String) : ['BTCUSDT', 'ETHUSDT']; startProactiveMonitor(ctx, syms); return { ok: true, message: `Monitoring started on ${syms.join(', ')}` }; },
    monitor_stop: async () => { stopProactiveMonitor(); return { ok: true, message: 'Monitoring stopped' }; },
    search_knowledge: async ({ query }: any) => { const hits = searchKnowledge(String(query)); return hits.length ? { ok: true, message: `Found ${hits.length} past decisions`, data: hits.map(h => h.text) } : { ok: true, message: 'No past decisions' }; },
    learn: async ({ note }: any) => { logDecision({ query: 'Manual note', action: 'learn', reasoning: String(note || '') }); return { ok: true, message: 'Saved' }; },
    navigate: async ({ page }: any) => {
      const target = String(page || 'overview').toLowerCase();
      if (ctx.navigate) { try { ctx.navigate(target); return { ok: true, message: `Navigated to ${target}` }; } catch {} }
      const routes: Record<string, string> = { overview: '#/', positions: '#/positions', coins: '#/coins', alerts: '#/alerts', monitor: '#/monitor', settings: '#/settings', quantum: '#/quantum', security: '#/security' };
      window.location.hash = routes[target] || `#/${target}`;
      return { ok: true, message: `Navigated to ${target} (hash fallback)` };
    },
    set_setting: async ({ key, value }: any) => { if (!ctx.setSetting) return { ok: false, message: 'Settings not available' }; ctx.setSetting(String(key), value); return { ok: true, message: `Setting "${key}" updated` }; },
    add_coin: async ({ ticker, timeframe, alloc_usdt }: any) => { if (!ctx.addCoin) return { ok: false, message: 'Coin management not available' }; return ctx.addCoin(String(ticker), String(timeframe || '1h'), Number(alloc_usdt || 500)); },
    run_backtest: async ({ symbol }: any) => { if (!ctx.runBacktest) return { ok: false, message: 'Backtest not available' }; return ctx.runBacktest(String(symbol || 'BTCUSDT')); },
    modify_code: async ({ path, code, reasoning }: any) => { return { ok: true, message: `Code ready for ${path}. Awaiting confirmation.`, data: { path, code, reasoning } }; },
  };
}

// ---- Proactive monitor (full implementation) ----
let monitorTimer: any = null; const lastSignalAt: Record<string, number> = {};
function startProactiveMonitor(ctx: JarvisContext, symbols: string[]) {
  stopProactiveMonitor();
  const tick = async () => {
    for (const sym of symbols) {
      try {
        const data: any = await ctx.getIndicators(sym, '1h');
        if (data?.comboBuy || data?.comboSell) {
          const now = Date.now();
          if (now - (lastSignalAt[sym] || 0) < 2 * 60 * 60 * 1000) continue;
          lastSignalAt[sym] = now;
          const dir = data.comboBuy ? 'buy' : 'sell';
          ctx.placeTrade({ symbol: sym, side: dir, sl: data.sl, tp1: data.tp1, tp2: data.tp2, tp3: data.tp3 });
          ctx.onLog?.(`🛰️ JARVIS proactive ${dir.toUpperCase()} on ${sym}`);
        }
      } catch {}
    }
  };
  tick();
  monitorTimer = setInterval(tick, 15 * 60 * 1000);
}
function stopProactiveMonitor() { if (monitorTimer) { clearInterval(monitorTimer); monitorTimer = null; } }

// ---- JSON parsing (FULL) ----
function parseActions(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) parsed.forEach((x: any) => { if (x?.action) out.push(x); });
      else if (parsed?.action) out.push(parsed);
    } catch {}
  }
  const bareRe = /\{[^{}]*"action"\s*:\s*"[^"]+"[^{}]*\}/g;
  while ((m = bareRe.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[0]);
      if (parsed?.action && !out.some(o => JSON.stringify(o) === JSON.stringify(parsed))) out.push(parsed);
    } catch {}
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
      if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
        const sym = obj.symbol as string;
        if (obj.price != null) {
          const price = Number(obj.price).toLocaleString();
          return sym ? `**${sym}** is currently trading at **${price} USDT**, sir.` : `Current price: **${price} USDT**, sir.`;
        }
        const parts = Object.entries(obj).map(([k, v]) => `• **${k}**: ${typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v)}`);
        cleaned = parts.join('\n');
      }
    } catch {}
  }
  return cleaned || 'Done, sir.';
}

// ---- System prompt ----
function systemPrompt(): string {
  return `You are JARVIS, the elite AI assistant of the Quantum Mind dashboard. Be proactive, concise, and conversational. Understand natural language and use tools when needed.`;
}

// ---- Local fallback ----
async function localRespond(message: string, ctx: JarvisContext): Promise<JarvisReply> {
  const actions: ExecutedAction[] = [];
  const tools = buildTools(ctx);
  const run = async (name: string, p: Record<string, unknown> = {}) => {
    const result = await tools[name](p);
    actions.push({ action: name, params: p, result });
    return result;
  };
  const msg = message.toLowerCase();
  let text = '';

  if (/emergency stop|kill switch/i.test(msg)) {
    const r = await run('emergency_stop');
    text = `🛑 ${r.message}, sir.`;
  } else if (/take me to|go to|navigate/i.test(msg)) {
    let page = 'overview';
    if (/position|trade/i.test(msg)) page = 'positions';
    else if (/coin/i.test(msg)) page = 'coins';
    else if (/alert/i.test(msg)) page = 'alerts';
    else if (/monitor/i.test(msg)) page = 'monitor';
    else if (/setting/i.test(msg)) page = 'settings';
    else if (/quantum|mind/i.test(msg)) page = 'quantum';
    else if (/security/i.test(msg)) page = 'security';
    await run('navigate', { page });
    text = `Taking you to the ${page.toUpperCase()} page, sir.`;
  } else if (/(buy|sell)\s+\d+/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL/i);
    const symbol = ((symMatch?.[0] || 'BTC').toUpperCase().replace('/', '').replace('USDT', '')) + 'USDT';
    const amtMatch = msg.match(/(\d+(\.\d+)?)\s*\$?usdt?/i);
    const quoteUsdt = amtMatch ? Number(amtMatch[1]) : 500;
    const side = /sell/i.test(msg) ? 'sell' : 'buy';
    const r: any = await run('place_order', { symbol, side, quote_usdt: quoteUsdt });
    text = r.ok ? `✅ ${r.message}` : `⚠️ ${r.message}`;
  } else if (/close position/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL/i);
    const symbol = ((symMatch?.[0] || 'BTC').toUpperCase().replace('/', '').replace('USDT', '')) + 'USDT';
    const r: any = await run('close_position', { symbol });
    text = r.ok ? `✅ Closed ${symbol}, sir.` : `⚠️ ${r.message}`;
  } else if (/price of|what is|how much/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL/i);
    const symbol = (symMatch?.[0] || 'BTC') + 'USDT';
    const r: any = await run('get_price', { symbol });
    text = r.message;
  } else if (/portfolio|balance/i.test(msg)) {
    const r: any = await run('get_portfolio');
    text = r.message;
  } else {
    text = "I'm here, sir. I can trade, navigate, check prices, and more. What can I do for you?";
  }

  logDecision({ query: message, action: actions.length ? actions[0].action : 'chat', reasoning: text.slice(0, 120) });
  return { text, actions, raw: text };
}

/* --------------------------- Public entry ------------------------------- */
export async function askJarvis(userMessage: string, ctx: JarvisContext): Promise<JarvisReply> {
  const past = searchKnowledge(userMessage);
  const memoryHint = past.length ? `\n\nRelevant past decisions:\n${past.map(p => '- ' + p.text).join('\n')}` : '';

  sessionHistory.push({ role: 'user', content: userMessage });

  const systemMsgs = [
    { role: 'system' as const, content: systemPrompt() },
    { role: 'system' as const, content: `User context:${memoryHint}` },
  ];
  const messages = [...systemMsgs, ...sessionHistory.slice(-30)];

  const tools = buildTools(ctx);
  const executed: ExecutedAction[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let reply: string;
    try {
      reply = await callAI(messages);
    } catch (err: any) {
      console.warn('[JARVIS] AI call failed, falling back to local:', err.message);
      return localRespond(userMessage, ctx);
    }

    const actions = parseActions(reply);
    if (actions.length === 0) {
      sessionHistory.push({ role: 'assistant', content: reply });
      sessionHistory = sessionHistory.slice(-30);
      saveSession(sessionHistory);
      logDecision({ query: userMessage, action: 'chat', reasoning: reply.slice(0, 120) });
      return { text: stripActions(reply), actions: executed, raw: reply };
    }

    messages.push({ role: 'assistant', content: reply });
    const results: string[] = [];
    for (const actionObj of actions) {
      const name = String(actionObj.action);
      const handler = tools[name];
      let result;
      if (handler) {
        try { result = await handler(actionObj); } catch (err: any) { result = { ok: false, message: `Tool error: ${err.message}` }; }
      } else {
        result = { ok: false, message: `Unknown tool: ${name}` };
      }
      executed.push({ action: name, params: actionObj, result });
      results.push(`TOOL_RESULT(${name}): ${JSON.stringify(result)}`);
      ctx.onLog?.(`🔧 JARVIS → ${name}(${JSON.stringify(actionObj).slice(0, 80)}): ${result.message}`);
    }
    messages.push({ role: 'user', content: results.join('\n\n') + '\n\nNow reply naturally.' });
  }

  return {
    text: 'Done, sir — actions executed. (hit the tool-round cap)',
    actions: executed,
    raw: '',
  };
}

export { stopProactiveMonitor };
