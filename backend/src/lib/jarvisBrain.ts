// ============================================================================
// JARVIS BRAIN — autonomous AI agent (Browser-side) with TOTAL dashboard control.
//
// Powered by Cloudflare Worker (multi-fallback: Groq/Gemini/SambaNova/CF AI)
// Worker URL: https://quantum-mind.mohammadfaruki2008.workers.dev/
//
// JARVIS can read files, modify code, trade, navigate, and much more.
// Just talk naturally — he will understand and act.
// ============================================================================

import fs from 'fs';
import path from 'path';
import * as binance from './binance';

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
      return { ok: true, message: `Mapsd to ${page} page` };
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

    // ── file & code tools ──────────────────────────
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
  
  // 🛠️ Secure regex constructors to prevent system markdown rendering corruption
  const fenceRe = new RegExp('