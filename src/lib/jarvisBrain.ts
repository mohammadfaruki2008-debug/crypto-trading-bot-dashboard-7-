// ============================================================================
// JARVIS BRAIN — Iron Man style autonomous AI agent + powerful offline fallback
// ============================================================================
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

const WORKER_URL = 'https://quantum-mind.mohammadfaruki2008.workers.dev/';
const MAX_TOOL_ROUNDS = 6;

/* ---- SESSION MEMORY ---- */
const SESSION_STORAGE_KEY = 'jarvis_session_v1';
function loadSession() { try { return JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || '[]'); } catch { return []; } }
function saveSession(h: { role: string; content: string }[]) { localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(h.slice(-30))); }
let sessionHistory: { role: string; content: string }[] = loadSession();

/* ---- RAG Knowledge ---- */
interface KnowledgeEntry { id: string; ts: string; query: string; action: string; reasoning: string; text: string; vec: number[] }
const KB_KEY = 'jarvis_knowledge_v1';
function loadKB() { try { return JSON.parse(localStorage.getItem(KB_KEY) || '[]'); } catch { return []; } }
function saveKB(kb: KnowledgeEntry[]) { localStorage.setItem(KB_KEY, JSON.stringify(kb.slice(-200))); }
function tokenize(s: string) { return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2); }
function embed(text: string): number[] {
  const v = new Array(256).fill(0);
  for (const w of tokenize(text)) { let h = 0; for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0; v[h % 256] += 1; }
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map(x => x / norm);
}
function cosine(a: number[], b: number[]) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function logDecision(d: { query: string; action: string; reasoning: string }) {
  const kb = loadKB(); const text = `${d.query} | ${d.action} | ${d.reasoning}`;
  kb.push({ id: `k_${Date.now()}`, ts: new Date().toISOString(), text, vec: embed(text), ...d }); saveKB(kb);
}
function searchKnowledge(query: string, topK = 3) {
  const kb = loadKB(); if (!kb.length) return [];
  const qv = embed(query); return kb.map(e => ({ e, score: cosine(qv, e.vec) })).sort((a, b) => b.score - a.score).slice(0, topK).filter(x => x.score > 0.05).map(x => x.e);
}

/* ---- AI call ---- */
async function callAI(messages: { role: string; content: string }[]) {
  const res = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }), signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Worker ${res.status}`);
  const data = await res.json();
  return data.text || '';
}

/* ---- Tool registry (with smart navigate, modify_code, etc.) ---- */
function buildTools(ctx: JarvisContext): Record<string, (p: any) => Promise<{ ok: boolean; message: string; data?: unknown }>> {
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
    read_file: async ({ path }: any) => { if (!ctx.readFile) return { ok: false, message: 'File reader not available' }; return ctx.readFile(String(path)); },
    modify_code: async ({ path, code, reasoning }: any) => { return { ok: true, message: `Code ready for ${path}. Awaiting confirmation.`, data: { path, code, reasoning } }; },
  };
}

/* ---- Proactive monitor (unchanged) ---- */
let monitorTimer: any = null; const lastSignalAt: Record<string, number> = {};
function startProactiveMonitor(ctx: JarvisContext, symbols: string[]) { /* same as before */ }
function stopProactiveMonitor() { if (monitorTimer) { clearInterval(monitorTimer); monitorTimer = null; } }

/* ---- JSON parsing (unchanged) ---- */
function parseActions(text: string): Record<string, unknown>[] { /* ... same ... */ }
function stripActions(text: string): string { /* ... same ... */ }

/* ---- System prompt (autonomous) ---- */
function systemPrompt(): string {
  return `You are JARVIS, the AI assistant from Iron Man, now embedded in the Quantum Mind crypto dashboard. You control everything: trading, navigation, settings, code. Understand natural language, act proactively, and confirm risky actions. Be concise, helpful, and use tools without being asked explicitly when appropriate.`;
}

/* ---- LOCAL FALLBACK (extremely capable) ---- */
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

  // Navigation
  if (/take me to|go to|open|navigate to|switch to|show me/i.test(msg)) {
    let page = 'overview';
    if (/position|trade|active/i.test(msg)) page = 'positions';
    else if (/coin|pair/i.test(msg)) page = 'coins';
    else if (/alert|log/i.test(msg)) page = 'alerts';
    else if (/monitor|terminal/i.test(msg)) page = 'monitor';
    else if (/setting|config/i.test(msg)) page = 'settings';
    else if (/quantum|mind|chart/i.test(msg)) page = 'quantum';
    else if (/security|api/i.test(msg)) page = 'security';
    await run('navigate', { page });
    text = `Taking you to the ${page.toUpperCase()} page, sir.`;
  }
  // Trade with amount
  else if (/(buy|long|sell|short)\s+.*?\d+(\.\d+)?\s*\$?usdt/i.test(msg) || /place trade/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL|BNB|XRP|ADA/i);
    const symbol = (symMatch?.[0] || 'BTCUSDT').toUpperCase().replace('/', '').replace('USDT', '') + 'USDT';
    const side = /sell|short/i.test(msg) ? 'sell' : 'buy';
    const amtMatch = msg.match(/(\d+(\.\d+)?)\s*\$?usdt?/i);
    const quoteUsdt = amtMatch ? Number(amtMatch[1]) : 500;
    const r: any = await run('place_order', { symbol, side, quote_usdt: quoteUsdt });
    text = r.ok ? `✅ ${r.message}` : `⚠️ ${r.message}`;
  }
  // Close position
  else if (/close (the )?position|exit trade/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL|BNB/i);
    const symbol = ((symMatch?.[0] || 'BTC').toUpperCase().replace('/', '').replace('USDT', '')) + 'USDT';
    const r: any = await run('close_position', { symbol });
    text = r.ok ? `✅ Closed ${symbol}` : `⚠️ ${r.message}`;
  }
  // Set alert
  else if (/set (an )?alert/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL/i);
    const symbol = (symMatch?.[0] || 'BTC').toUpperCase().replace('/', '').replace('USDT', '') + 'USDT';
    const priceMatch = msg.match(/(\d+(\.\d+)?)\s*\$?/);
    const price = priceMatch ? Number(priceMatch[1]) : 0;
    const dir = /below/i.test(msg) ? 'below' : 'above';
    await run('set_alert', { symbol, price, direction: dir });
    text = `Alert set: ${symbol} ${dir} ${price} USDT`;
  }
  // Bot toggle
  else if (/start bot|resume bot|activate bot/i.test(msg)) { await run('toggle_bot', { state: 'on' }); text = 'Bot started.'; }
  else if (/stop bot|pause bot|halt bot/i.test(msg)) { await run('toggle_bot', { state: 'off' }); text = 'Bot paused.'; }
  // Monitor
  else if (/start monitor/i.test(msg)) { await run('monitor_start', {}); text = 'Monitoring engaged.'; }
  else if (/stop monitor/i.test(msg)) { await run('monitor_stop'); text = 'Monitoring stopped.'; }
  // Add coin
  else if (/add (coin|pair)/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|AVAX|LINK|DOT|ADA|ATOM/i);
    const ticker = ((symMatch?.[0] || 'AVAX').toUpperCase().replace('/', '').replace('USDT', '')) + 'USDT';
    const r: any = await run('add_coin', { ticker, timeframe: '1h', alloc_usdt: 500 });
    text = r.ok ? `Added ${ticker}` : r.message;
  }
  // Scan
  else if (/(scan|analyze|market|indicators|opportunit)/i.test(msg) && /\b(now|please|can you|run|do)\b/i.test(msg)) {
    const pf = ctx.getPortfolio();
    const syms = (pf.coins as any[]).filter((c: any) => c.isActive).map((c: any) => c.ticker).slice(0, 3) || ['BTCUSDT'];
    let lines: string[] = [];
    for (const s of syms) {
      const pr: any = await run('get_price', { symbol: s });
      const price = pr.ok ? pr.data?.price?.toLocaleString() : 'N/A';
      const ind: any = await run('get_indicators', { symbol: s, timeframe: '1h' });
      const d = ind.data || {};
      lines.push(`**${s}** ${price} USDT – ${d.comboBuy ? '🟢 BUY' : d.comboSell ? '🔴 SELL' : '⚪ Neutral'}`);
    }
    text = `Scan results:\n\n${lines.join('\n')}`;
  }
  // Price check
  else if (/price of|what is|how much|current price/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL|BNB/i);
    const symbol = (symMatch?.[0] || 'BTC') + 'USDT';
    const r: any = await run('get_price', { symbol });
    text = r.message;
  }
  // Portfolio
  else if (/portfolio|balance|holding|account/i.test(msg)) {
    const r: any = await run('get_portfolio');
    text = r.message;
  }
  // Backtest
  else if (/backtest/i.test(msg)) {
    const symMatch = message.match(/[A-Za-z]{2,6}\/?USDT|BTC|ETH|SOL/i);
    const symbol = ((symMatch?.[0] || 'BTC').toUpperCase().replace('/', '').replace('USDT', '')) + 'USDT';
    const r: any = await run('run_backtest', { symbol });
    text = r.message;
  }
  // Help
  else if (/help|what can you|commands/i.test(msg)) {
    text = "I can trade, navigate, scan, set alerts, and more. Just speak naturally, sir.";
  }
  // Default
  else {
    text = "I'm here, sir. I can execute trades, navigate, set alerts, and more. What would you like me to do?";
  }

  logDecision({ query: message, action: actions.length ? actions[0].action : 'chat', reasoning: text.slice(0, 120) });
  return { text, actions, raw: text };
}

/* ---- Main entry ---- */
export async function askJarvis(userMessage: string, ctx: JarvisContext): Promise<JarvisReply> {
  const past = searchKnowledge(userMessage);
  const memoryHint = past.length ? `\n\nRelevant past:\n${past.map(p => '- ' + p.text).join('\n')}` : '';

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
      console.warn('AI unavailable, using local fallback:', err.message);
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
    for (const a of actions) {
      const name = String(a.action);
      const handler = tools[name];
      let result;
      if (handler) {
        try { result = await handler(a); } catch (err: any) { result = { ok: false, message: err.message }; }
      } else { result = { ok: false, message: `Unknown tool: ${name}` }; }
      executed.push({ action: name, params: a, result });
      results.push(`TOOL_RESULT(${name}): ${JSON.stringify(result)}`);
      ctx.onLog?.(`🔧 JARVIS → ${name}: ${result.message}`);
    }
    messages.push({ role: 'user', content: results.join('\n\n') + '\n\nNow reply naturally.' });
  }

  return { text: 'Actions executed, sir.', actions: executed, raw: '' };
}

export { stopProactiveMonitor };
