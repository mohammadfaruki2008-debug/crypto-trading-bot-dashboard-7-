import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  CandlestickChart, 
  Zap, 
  Check, 
  Radar,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Bot,
  ChevronDown,
  ChevronUp,
  Info,
  Search,
  Eye
} from 'lucide-react';
import { TradeableCoin, TradePosition, BotConfig, LiveTicker } from '../types';
import { analyzeQuad, fetchKlines, QuadAnalysis, computeQuadSeries, QuadChartSeries, Candle } from '../lib/quadEngine';
import { computeExtraIndicators, ExtraIndicators } from '../lib/extraIndicators';
import { QuadChart } from './QuadChart';

interface TradingViewChartViewProps {
  coins: TradeableCoin[];
  positions: TradePosition[];
  botConfig: BotConfig;
  tickers: Record<string, LiveTicker>;
  webhookSecret: string;
  onExecuteQuadTrade: (payload: any) => void;
  onNavigateToSettings: () => void;
}

const INTERVALS = [
  { label: '5m', binance: '5m' },
  { label: '15m', binance: '15m' },
  { label: '1H', binance: '1h' },
  { label: '4H', binance: '4h' },
  { label: '1D', binance: '1d' },
];
const DEFAULT_INTERVAL = INTERVALS[2]; // 1H default

const HISTORY_BARS_KEY = 'quad_tv_history_bars';
const AUTO_SCAN_MS = 60000;

const TV_PLANS = [
  { label: 'TV Basic (5K bars)', bars: 5000 },
  { label: 'TV Plus (10K bars)', bars: 10000 },
  { label: 'TV Premium (20K bars)', bars: 20000 },
  { label: 'Fast (2K bars)', bars: 2000 },
];

export const TradingViewChartView: React.FC<TradingViewChartViewProps> = ({
  coins,
  positions,
  botConfig,
  tickers,
  webhookSecret,
  onExecuteQuadTrade,
  onNavigateToSettings
}) => {
  const activeCoins = coins.filter(c => c.isActive);
  const [symbol, setSymbol] = useState(activeCoins[0]?.ticker || 'BTCUSDT');
  const [interval, setInterval_] = useState(DEFAULT_INTERVAL);
  const [historyBars, setHistoryBars] = useState<number>(() => {
    try { return parseInt(localStorage.getItem(HISTORY_BARS_KEY) || '5000', 10); } catch { return 5000; }
  });

  // Coin search (any Binance symbol — watch-only if not a tradeable pair)
  const [searchInput, setSearchInput] = useState('');
  const [searchError, setSearchError] = useState('');
  const [isLoadingView, setIsLoadingView] = useState(false);

  // QUAD state
  const [analysis, setAnalysis] = useState<QuadAnalysis | null>(null);
  const [extra, setExtra] = useState<ExtraIndicators | null>(null);
  const [allResults, setAllResults] = useState<QuadAnalysis[]>([]);
  const [chartSeries, setChartSeries] = useState<QuadChartSeries | null>(null);
  const candleCache = useRef<Record<string, Candle[]>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [autoMonitor, setAutoMonitor] = useState(true);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [nextRunIn, setNextRunIn] = useState(60);
  const firedThisSession = useRef<Set<string>>(new Set());

  // Advanced helper (collapsed)
  const [showPine, setShowPine] = useState(false);

  const openSymbols = positions.filter(p => p.status === 'open').map(p => p.ticker);
  const autoTradeReady = botConfig.autoTradeQuadSignals && botConfig.masterBotEnabled;
  const isWatchOnly = !activeCoins.some(c => c.ticker === symbol);

  // Live WS price for the viewed symbol (only tradeable coins are in tickers)
  const livePrice = tickers[symbol]?.price;
  const displayPrice = livePrice ?? analysis?.lastPrice;

  const cacheKey = (sym: string) => `${sym}_${interval.binance}_${historyBars}`;

  const loadSymbolView = useCallback(async (sym: string) => {
    const key = cacheKey(sym);
    let candles = candleCache.current[key];
    let source: 'binance_live' | 'simulated' = 'binance_live';
    if (!candles) {
      setIsLoadingView(true);
      const fallbackPrice = tickers[sym]?.price || 100;
      const fetched = await fetchKlines(sym, interval.binance, fallbackPrice, historyBars);
      candles = fetched.candles;
      source = fetched.source;
      candleCache.current[key] = candles;
      setIsLoadingView(false);
    }
    setAnalysis(analyzeQuad(sym, interval.binance, candles, source));
    setChartSeries(computeQuadSeries(candles));
    setExtra(computeExtraIndicators(candles));
  }, [interval.binance, historyBars, tickers]);

  // ─── Monitor loop: ONLY tradeable (active) coins are scanned & auto-traded ──
  const runQuadIndicator = useCallback(async (silent: boolean = false) => {
    if (activeCoins.length === 0) return;
    if (!silent) setIsRunning(true);

    const results: QuadAnalysis[] = [];
    for (const coin of activeCoins) {
      try {
        // Each tradeable pair is monitored on ITS OWN configured timeframe
        const coinTf = coin.timeframe || '1h';
        const fallbackPrice = tickers[coin.ticker]?.price || 100;
        const key = `${coin.ticker}_${coinTf}_${historyBars}`;
        const { candles, source } = await fetchKlines(coin.ticker, coinTf, fallbackPrice, historyBars);
        candleCache.current[key] = candles;
        const a = analyzeQuad(coin.ticker, coinTf, candles, source);
        results.push(a);

        const fireKey = `${a.symbol}_${coinTf}`;
        if (
          a.comboBuy &&
          autoTradeReady &&
          !openSymbols.includes(a.symbol) &&
          !firedThisSession.current.has(fireKey)
        ) {
          firedThisSession.current.add(fireKey);
          onExecuteQuadTrade({
            action: 'buy',
            ticker: a.symbol,
            tf: a.interval,
            price: a.entry,
            sl: a.sl,
            tp1: a.tp1,
            tp2: a.tp2,
            tp3: a.tp3,
            tqi: a.tqi,
            lore_prediction: a.lorePrediction,
            conf_factor: a.confFactor,
            secret: webhookSecret,
            source: 'Quantum Mind'
          });
        }
      } catch { /* skip */ }
    }

    setAllResults(results);
    const current = results.find(r => r.symbol === symbol);
    if (current) {
      setAnalysis(current);
      const cc = candleCache.current[`${symbol}_${current.interval}_${historyBars}`];
      if (cc) { setChartSeries(computeQuadSeries(cc)); setExtra(computeExtraIndicators(cc)); }
    }
    setLastRunAt(new Date().toISOString());
    setNextRunIn(AUTO_SCAN_MS / 1000);
    setIsRunning(false);
  }, [activeCoins, interval, symbol, tickers, autoTradeReady, openSymbols, webhookSecret, onExecuteQuadTrade, historyBars]);

  // Initial + interval/history change
  useEffect(() => {
    candleCache.current = {};
    runQuadIndicator();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval.binance, historyBars]);

  // Symbol change → load view (from cache or fetch, supports watch-only searched coins)
  useEffect(() => {
    loadSymbolView(symbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // Auto monitor every 60s
  useEffect(() => {
    if (!autoMonitor) return;
    const scanTimer = setInterval(() => runQuadIndicator(true), AUTO_SCAN_MS);
    const countdown = setInterval(() => setNextRunIn(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => { clearInterval(scanTimer); clearInterval(countdown); };
  }, [autoMonitor, runQuadIndicator]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError('');
    let sym = searchInput.trim().toUpperCase();
    if (!sym) return;
    if (!sym.endsWith('USDT')) sym = sym + 'USDT';

    // Validate against Binance before switching
    setIsLoadingView(true);
    try {
      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error('not found');
      setSymbol(sym);
      setSearchInput('');
    } catch {
      setSearchError(`"${sym}" Binance Spot-এ পাওয়া যায়নি`);
    }
    setIsLoadingView(false);
  };

  const handleManualExecute = (a: QuadAnalysis) => {
    onExecuteQuadTrade({
      action: 'buy',
      ticker: a.symbol,
      tf: a.interval,
      price: a.entry,
      sl: a.sl,
      tp1: a.tp1,
      tp2: a.tp2,
      tp3: a.tp3,
      tqi: a.tqi,
      lore_prediction: a.lorePrediction,
      conf_factor: a.confFactor,
      secret: webhookSecret,
      source: 'Quantum Mind'
    });
  };

  const buySignals = allResults.filter(r => r.comboBuy);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 text-left">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-700 flex items-center justify-center text-white font-bold shadow-lg shadow-purple-500/20">
            <CandlestickChart className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Quantum Mind</h2>
            <p className="text-xs text-slate-400">
              Tradeable pair গুলো auto-monitor হয় • Signal এলেই auto-trade • যেকোনো coin search করে দেখুন
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setAutoMonitor(!autoMonitor)}
            className={`px-3.5 py-2 rounded-2xl text-xs font-bold font-mono flex items-center gap-2 border transition-all ${
              autoMonitor
                ? 'bg-purple-950 text-purple-300 border-purple-700'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoMonitor ? 'bg-purple-400 animate-ping' : 'bg-slate-500'}`} />
            {autoMonitor ? `Auto-Monitor ON (${nextRunIn}s)` : 'Auto-Monitor OFF'}
          </button>

          <span className={`px-3 py-2 rounded-2xl text-xs font-mono font-bold border flex items-center gap-1.5 ${
            autoTradeReady
              ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}>
            <Bot className="w-3.5 h-3.5" />
            {autoTradeReady ? 'AUTO-TRADE ON' : 'AUTO-TRADE OFF'}
          </span>
          {!autoTradeReady && (
            <button onClick={onNavigateToSettings} className="text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 underline">
              Enable
            </button>
          )}
        </div>
      </div>

      {/* Buy signal banner */}
      {buySignals.length > 0 && (
        <div className="bg-emerald-950/40 border border-emerald-500/50 rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0 animate-bounce" />
            <p className="text-xs text-emerald-200">
              <strong>▲ QUANTUM MIND BUY active:</strong>{' '}
              <span className="font-mono font-bold">{buySignals.map(s => s.symbol).join(', ')}</span>
              {autoTradeReady ? ' — auto-trade fired/firing on fresh signals.' : ' — Auto-Trade OFF, manual execute available.'}
            </p>
          </div>
          {buySignals.some(s => s.symbol !== symbol) && (
            <button
              onClick={() => setSymbol(buySignals[0].symbol)}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors"
            >
              Chart-এ দেখুন →
            </button>
          )}
        </div>
      )}

      {/* Controls: monitored coins + search + timeframe + plan */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Monitored (tradeable) coins */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1">Monitoring:</span>
            {activeCoins.map(c => {
              const res = allResults.find(r => r.symbol === c.ticker);
              const coinTf = c.timeframe || '1h';
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setSymbol(c.ticker);
                    const match = INTERVALS.find(tf => tf.binance === coinTf);
                    if (match) setInterval_(match);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-1.5 ${
                    symbol === c.ticker
                      ? 'bg-purple-600 text-white shadow'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {res?.comboBuy && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
                  {res?.comboSell && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />}
                  {c.ticker}
                  <span className="text-[9px] opacity-60">{coinTf}</span>
                </button>
              );
            })}
            {isWatchOnly && (
              <span className="px-3.5 py-2 rounded-xl text-xs font-bold font-mono bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> {symbol} (Watch Only)
              </span>
            )}
          </div>

          {/* Coin search */}
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => { setSearchInput(e.target.value); setSearchError(''); }}
                placeholder="Coin খুঁজুন... (e.g. LINK, AVAX)"
                className="w-52 bg-slate-950 border border-slate-800 rounded-2xl py-2 pl-9 pr-3 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors uppercase"
              />
            </div>
            <button
              type="submit"
              disabled={isLoadingView || !searchInput.trim()}
              className="px-4 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-purple-300 font-bold text-xs border border-slate-700 transition-colors disabled:opacity-50"
            >
              {isLoadingView ? '...' : 'Search'}
            </button>
          </form>
        </div>

        {searchError && (
          <div className="text-[11px] text-rose-400 font-mono px-1">⚠️ {searchError}</div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/60 pt-3">
          {/* Timeframes — 1H default */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 font-mono text-xs font-bold">
            <span className="text-slate-500 pl-2 pr-1">TF:</span>
            {INTERVALS.map(tf => (
              <button
                key={tf.binance}
                onClick={() => setInterval_(tf)}
                className={`px-3.5 py-2 rounded-xl transition-all ${
                  interval.binance === tf.binance ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={TV_PLANS.some(p => p.bars === historyBars) ? historyBars : 'custom'}
              onChange={(e) => {
                if (e.target.value === 'custom') return;
                const v = parseInt(e.target.value, 10);
                setHistoryBars(v);
                try { localStorage.setItem(HISTORY_BARS_KEY, String(v)); } catch { /* ignore */ }
              }}
              title="আপনার TradingView plan-এর chart history-র সাথে মিলান"
              className="bg-slate-950 border border-slate-800 rounded-2xl px-3 py-2.5 text-xs font-mono font-bold text-purple-300 focus:outline-none focus:border-purple-500"
            >
              {TV_PLANS.map(p => (
                <option key={p.bars} value={p.bars}>{p.label}</option>
              ))}
              <option value="custom">Custom...</option>
            </select>

            {/* EXACT bar count — Lorentzian matching needs the same dataset length as TV */}
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={2100}
                max={20000}
                step={1}
                value={historyBars}
                onChange={(e) => {
                  const v = Math.max(2100, Math.min(20000, parseInt(e.target.value, 10) || 5000));
                  setHistoryBars(v);
                  try { localStorage.setItem(HISTORY_BARS_KEY, String(v)); } catch { /* ignore */ }
                }}
                title="TV chart-এর exact loaded bar count লিখুন (নিচের Pine snippet দিয়ে বের করুন)"
                className="w-24 bg-slate-950 border border-purple-800/60 rounded-2xl px-3 py-2.5 text-xs font-mono font-bold text-purple-300 focus:outline-none focus:border-purple-500"
              />
              <span className="text-[9px] text-slate-500 font-mono">exact<br/>bars</span>
            </div>

            <button
              onClick={() => runQuadIndicator()}
              disabled={isRunning}
              className="px-4 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-600/20 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
              {isRunning ? 'Running...' : 'Re-run Quantum Mind'}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ QUAD INDICATOR CHART ═══ */}
      <div className={`rounded-3xl border-2 shadow-2xl overflow-hidden ${
        analysis?.comboBuy
          ? 'border-emerald-500/60 bg-slate-900'
          : analysis?.comboSell
          ? 'border-rose-500/50 bg-slate-900'
          : 'border-purple-500/30 bg-slate-900'
      }`}>
        {/* Indicator header */}
        <div className="px-5 py-3 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Radar className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-bold text-white font-mono">Quantum Mind — 8-Engine Suite</span>
            <span className="text-[10px] text-slate-500 font-mono">
              v1.0.0 • {symbol} • {interval.label}
              {analysis && <> • kNN pool: first 2000 / {analysis.candleCount.toLocaleString()} bars</>}
            </span>
            {isWatchOnly && (
              <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 text-[9px] font-mono font-bold">
                WATCH ONLY — Tradeable Pair-এ add করলে auto-trade হবে
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            {/* LIVE price badge — from Binance WebSocket ticker stream */}
            {displayPrice !== undefined && (
              <span className={`px-2.5 py-1 rounded-lg border font-bold text-xs flex items-center gap-1.5 ${
                livePrice !== undefined
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}>
                {livePrice !== undefined && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />}
                {displayPrice.toLocaleString('en-US', { minimumFractionDigits: displayPrice < 5 ? 4 : 2 })}
                <span className="text-[9px] opacity-70">{livePrice !== undefined ? 'LIVE WS' : 'LAST CLOSE'}</span>
              </span>
            )}
            {analysis && (
              <span className={`px-2 py-0.5 rounded border ${
                analysis.dataSource === 'binance_live'
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                  : 'bg-amber-950 text-amber-400 border-amber-800'
              }`}>
                {analysis.dataSource === 'binance_live' ? '● LIVE KLINES' : '○ SIM'}
              </span>
            )}
            {lastRunAt && <span className="text-slate-500">Updated {new Date(lastRunAt).toLocaleTimeString()}</span>}
          </div>
        </div>

        {/* Chart */}
        {chartSeries ? (
          <QuadChart
            series={chartSeries}
            analysis={analysis}
            symbol={symbol}
            intervalLabel={interval.label}
          />
        ) : (
          <div className="h-[520px] flex flex-col items-center justify-center gap-3 bg-[#0d1117]">
            <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
            <p className="text-xs text-slate-400 font-mono">Loading {historyBars.toLocaleString()} Binance candles &amp; computing Quantum Mind engines...</p>
          </div>
        )}

        {/* Lorentzian bar-by-bar comparison strip — match against TV's per-bar prediction labels */}
        {chartSeries && chartSeries.lore.length > 10 && (
          <div className="px-5 py-3 bg-slate-950/60 border-t border-slate-800 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0">
              Lore last 10 bars (oldest → newest):
            </span>
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
              {chartSeries.lore.slice(-10).map((p, i, arr) => (
                <span
                  key={i}
                  className={`px-2 py-1 rounded-lg border ${
                    i === arr.length - 1 ? 'ring-1 ring-purple-500 ' : ''
                  }${
                    p > 0
                      ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                      : p < 0
                      ? 'bg-rose-950 text-rose-400 border-rose-800'
                      : 'bg-slate-900 text-slate-500 border-slate-800'
                  }`}
                  title={i === arr.length - 1 ? 'Current bar' : `${arr.length - 1 - i} bars ago`}
                >
                  {p > 0 ? '+' : ''}{p}
                </span>
              ))}
            </div>
            <span className="text-[9px] text-slate-600 font-mono ml-auto">
              TV chart-এ "Show Prediction Values" on করে প্রতি bar-এর number-এর সাথে মিলান
            </span>
          </div>
        )}

        {/* Panel: trade plan + execution */}
        {analysis && (
          <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5 border-t border-slate-800">
            {/* Trade Plan */}
            <div className="bg-slate-950 rounded-2xl border border-slate-800 p-5 space-y-3">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Quantum Mind Trade Plan</span>
                <span className="text-purple-400 font-mono normal-case">conf ×{analysis.confFactor}</span>
              </div>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400">ENTRY</span>
                  <span className="text-white font-bold">{analysis.entry.toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/50">
                  <span className="text-rose-400">SL</span>
                  <span className="text-white font-bold">{analysis.sl.toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-800/40">
                  <span className="text-emerald-400">TP1</span>
                  <span className="text-white font-bold">{analysis.tp1.toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-800/40">
                  <span className="text-emerald-400">TP2</span>
                  <span className="text-white font-bold">{analysis.tp2.toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-800/40">
                  <span className="text-emerald-400">TP3</span>
                  <span className="text-white font-bold">{analysis.tp3.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Execution */}
            <div className="bg-slate-950 rounded-2xl border border-slate-800 p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">Execution Engine</div>

                {isWatchOnly ? (
                  <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-700/50 text-center space-y-1.5">
                    <Eye className="w-6 h-6 text-amber-400 mx-auto" />
                    <p className="text-xs text-amber-300 font-bold">Watch-Only Mode</p>
                    <p className="text-[10px] text-slate-400">
                      এই coin trade করতে চাইলে <strong>Tradeable Coins</strong> পেজে add করুন — তারপর auto-monitor + auto-trade হবে
                    </p>
                  </div>
                ) : analysis.comboBuy ? (
                  openSymbols.includes(analysis.symbol) ? (
                    <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-1">
                      <p className="text-xs text-slate-300 font-semibold">♻️ Position already open on {analysis.symbol}</p>
                      <p className="text-[10px] text-slate-500">One trade per symbol rule active</p>
                    </div>
                  ) : firedThisSession.current.has(`${analysis.symbol}_${interval.binance}`) ? (
                    <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-700 text-center space-y-1">
                      <Check className="w-6 h-6 text-emerald-400 mx-auto" />
                      <p className="text-xs text-emerald-300 font-bold">Auto-traded this session!</p>
                      <p className="text-[10px] text-slate-400">Check Active Positions for trailing status</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {autoTradeReady ? (
                        <div className="p-3 rounded-2xl bg-purple-950/40 border border-purple-700/50 text-center">
                          <p className="text-[11px] text-purple-300 font-semibold animate-pulse">⏳ Next auto-scan cycle-এ trade fire হবে...</p>
                        </div>
                      ) : (
                        <div className="p-3 rounded-2xl bg-amber-950/30 border border-amber-700/50 text-center">
                          <p className="text-[11px] text-amber-300">Auto-Trade OFF — Settings-এ Auto-Trade toggle চালু করুন</p>
                        </div>
                      )}
                      <button
                        onClick={() => handleManualExecute(analysis)}
                        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all transform active:scale-95"
                      >
                        <Zap className="w-4 h-4 fill-current" />
                        Execute Quantum Mind Buy Now
                      </button>
                    </div>
                  )
                ) : analysis.comboSell ? (
                  <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-800/50 text-center space-y-1">
                    <TrendingDown className="w-6 h-6 text-rose-400 mx-auto" />
                    <p className="text-xs text-rose-300 font-bold">COMBO SELL detected</p>
                    <p className="text-[10px] text-slate-400">Spot bot শুধু BUY trade নেয়</p>
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-1">
                    <Radar className="w-6 h-6 text-slate-500 mx-auto animate-pulse" />
                    <p className="text-xs text-slate-400 font-semibold">Waiting for Quantum Mind agreement</p>
                    <p className="text-[10px] text-slate-600">Auto-monitor প্রতি ৬০ সেকেন্ডে re-check করছে</p>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-800 pt-3 text-[10px] text-slate-500 font-mono space-y-1">
                <div className="flex justify-between">
                  <span>Monitoring</span>
                  <span className="text-purple-400">{activeCoins.length} tradeable pairs • {interval.label}</span>
                </div>
                <div className="flex justify-between">
                  <span>Signal logic</span>
                  <span className="text-slate-400">SATS▲ + Lore&gt;0 + Kernel = BUY</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ 8-INDICATOR ENSEMBLE BREAKDOWN ═══ */}
        {analysis && extra && (
          <div className="px-5 pb-5 border-t border-slate-800 pt-5">
            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-pulse" />
              Full Indicator Suite (8 Engines)
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
              {/* 1. SATS */}
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase mb-1">SATS SuperTrend</div>
                <div className={`font-bold ${analysis.satsTrend === 1 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {analysis.satsTrend === 1 ? 'Bullish ▲' : 'Bearish ▼'}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">TQI {analysis.tqi.toFixed(2)}</div>
              </div>

              {/* 2. Lorentzian */}
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase mb-1">Lorentzian ML</div>
                <div className={`font-bold ${analysis.lorePrediction > 0 ? 'text-emerald-400' : analysis.lorePrediction < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                  {analysis.lorePrediction > 0 ? 'Bullish ▲' : analysis.lorePrediction < 0 ? 'Bearish ▼' : 'Flat'}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">pred {analysis.lorePrediction > 0 ? '+' : ''}{analysis.lorePrediction}</div>
              </div>

              {/* 3. Squeeze */}
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase mb-1">Squeeze Momentum</div>
                <div className={`font-bold ${analysis.squeezeFiredBullish ? 'text-emerald-400' : analysis.squeezeOn ? 'text-amber-400' : 'text-slate-500'}`}>
                  {analysis.squeezeFiredBullish ? 'FIRED ▲' : analysis.squeezeOn ? 'SQZ ON' : 'Released'}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">compression</div>
              </div>

              {/* 4. RSI Divergence */}
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase mb-1">RSI Divergence</div>
                <div className={`font-bold ${
                  extra.rsiRegularBull || extra.rsiHiddenBull ? 'text-emerald-400'
                  : extra.rsiRegularBear || extra.rsiHiddenBear ? 'text-rose-400' : 'text-slate-500'
                }`}>
                  {extra.rsiRegularBull ? 'Reg Bull ▲' : extra.rsiHiddenBull ? 'Hid Bull ▲'
                  : extra.rsiRegularBear ? 'Reg Bear ▼' : extra.rsiHiddenBear ? 'Hid Bear ▼' : 'None'}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">RSI {extra.rsi}</div>
              </div>

              {/* 5. Ichimoku Force */}
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase mb-1">Ichimoku Force</div>
                <div className={`font-bold ${extra.ichiForce > 8 ? 'text-emerald-400' : extra.ichiForce < -8 ? 'text-rose-400' : 'text-slate-500'}`}>
                  {extra.ichiForce > 0 ? '+' : ''}{extra.ichiForce}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">{extra.ichiState}</div>
              </div>

              {/* 6. MACD */}
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase mb-1">MACD</div>
                <div className={`font-bold ${
                  extra.macdBullDiv ? 'text-emerald-400' : extra.macdBearDiv ? 'text-rose-400'
                  : extra.macdHist > 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {extra.macdBullDiv ? 'Bull Div ▲' : extra.macdBearDiv ? 'Bear Div ▼'
                  : extra.macdBullCross ? 'Bull Cross ▲' : extra.macdBearCross ? 'Bear Cross ▼'
                  : extra.macdHist > 0 ? 'Hist + ▲' : 'Hist − ▼'}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">hist {extra.macdHist}</div>
              </div>

              {/* 7. Volume Profile */}
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase mb-1">Volume Profile</div>
                <div className={`font-bold ${extra.priceVsPoc === 'above' ? 'text-emerald-400' : extra.priceVsPoc === 'below' ? 'text-rose-400' : 'text-slate-500'}`}>
                  {extra.priceVsPoc === 'above' ? 'Above POC ▲' : extra.priceVsPoc === 'below' ? 'Below POC ▼' : 'At POC'}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">POC {extra.poc.toLocaleString()} · VA {extra.val.toLocaleString()}–{extra.vah.toLocaleString()}</div>
              </div>

              {/* 8. Smart Money Concepts */}
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase mb-1">Smart Money Concepts</div>
                <div className={`font-bold ${extra.smcTrend === 'bullish' ? 'text-emerald-400' : extra.smcTrend === 'bearish' ? 'text-rose-400' : 'text-slate-500'}`}>
                  {extra.smcTrend === 'bullish' ? 'Bull Structure ▲' : extra.smcTrend === 'bearish' ? 'Bear Structure ▼' : 'Neutral'}
                  {extra.smcBOS && ' · BOS'}
                  {extra.smcCHoCH && ' · CHoCH'}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">{extra.smcInOrderBlock ? '⚡ In Order Block' : 'Outside OB'}</div>
              </div>
            </div>

            {/* Consensus bar */}
            {(() => {
              const votes = [
                analysis.satsTrend === 1 ? 1 : -1,                                                    // 1. SATS
                analysis.lorePrediction > 0 ? 1 : analysis.lorePrediction < 0 ? -1 : 0,             // 2. Lorentzian
                analysis.squeezeFiredBullish ? 1 : 0,                                                  // 3. Squeeze
                extra.rsiRegularBull || extra.rsiHiddenBull ? 1 : extra.rsiRegularBear || extra.rsiHiddenBear ? -1 : 0, // 4. RSI Div
                extra.ichiForce > 8 ? 1 : extra.ichiForce < -8 ? -1 : 0,                              // 5. Ichimoku
                extra.macdBullDiv || extra.macdBullCross || extra.macdHist > 0 ? 1 : -1,             // 6. MACD
                extra.priceVsPoc === 'above' ? 1 : extra.priceVsPoc === 'below' ? -1 : 0,            // 7. Volume Profile
                extra.smcTrend === 'bullish' ? 1 : extra.smcTrend === 'bearish' ? -1 : 0,           // 8. Smart Money Concepts
              ];
              const bull = votes.filter(v => v > 0).length;
              const bear = votes.filter(v => v < 0).length;
              const pct = Math.round((bull / votes.length) * 100);
              return (
                <div className="mt-4 p-4 rounded-2xl bg-slate-950 border border-slate-800">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-400 font-mono">Ensemble Consensus</span>
                    <span className={`font-bold font-mono ${pct >= 65 ? 'text-emerald-400' : pct <= 35 ? 'text-rose-400' : 'text-amber-400'}`}>
                      {pct}% Bullish · {bull}▲ / {bear}▼
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden flex">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                    <div className="h-full bg-rose-500 transition-all" style={{ width: `${100 - pct}%` }} />
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-2">
                    Trade fires when ≥6 of 8 engines agree + ML confidence passes (Quantum Mind consensus)
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* All monitored coins signal strip */}
        {allResults.length > 1 && (
          <div className="px-5 pb-5 flex flex-wrap gap-2">
            {allResults.map(r => (
              <button
                key={r.symbol}
                onClick={() => setSymbol(r.symbol)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-mono font-bold border transition-all ${
                  r.comboBuy
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700 hover:bg-emerald-900'
                    : r.comboSell
                    ? 'bg-rose-950/60 text-rose-300 border-rose-800'
                    : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
                }`}
              >
                {r.symbol} <span className="opacity-50">{r.interval}</span> {r.comboBuy ? '▲ BUY' : r.comboSell ? '▼' : '–'} <span className="opacity-60">({r.lorePrediction > 0 ? '+' : ''}{r.lorePrediction})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* How it works — TradingView-free explainer */}
      <div className="bg-gradient-to-br from-emerald-950/30 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-2.5">
          <Zap className="w-5 h-5 text-emerald-400" />
          <h3 className="text-base font-bold text-white">কিভাবে কাজ করে (TradingView লাগে না)</h3>
          <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-[9px] font-mono font-bold">100% SELF-CONTAINED</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="text-emerald-400 font-bold text-[10px] uppercase tracking-wider">১. Binance থেকে candles</div>
            <p className="text-slate-300 leading-relaxed">আপনার Tradeable Coins-এর প্রতিটা pair-এর live candle ডেটা সরাসরি Binance থেকে fetch হয়</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="text-purple-400 font-bold text-[10px] uppercase tracking-wider">২. Quantum Mind run</div>
            <p className="text-slate-300 leading-relaxed">৮টা indicator-এর exact লজিক (SATS, Lorentzian, Squeeze, SMC, RSI Div, Ichimoku, MACD, Volume Profile) ব্রাউজারেই চলে — প্রতি ৬০ সেকেন্ডে</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="text-amber-400 font-bold text-[10px] uppercase tracking-wider">৩. Combo Signal</div>
            <p className="text-slate-300 leading-relaxed">৮টা engine-এর consensus (≥6 bullish) + ML confidence = <strong className="text-emerald-300">QUANTUM MIND BUY</strong></p>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
            <div className="text-cyan-400 font-bold text-[10px] uppercase tracking-wider">৪. Auto-trade</div>
            <p className="text-slate-300 leading-relaxed">Auto-Trade toggle ON থাকলে সরাসরি Binance Spot-এ buy order — SL/TP1/TP2/TP3 সহ</p>
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/20 text-[11px] text-slate-300 leading-relaxed">
          ✅ <strong className="text-emerald-300">কোনো TradingView account, Pro/Premium subscription, webhook, Pine paste, email alert কিছুই লাগে না।</strong> আপনি শুধু Tradeable Coins পেজে coin আর timeframe add করবেন — বাকি সব এই app নিজেই করবে। TradingView শুধু comparison-এর জন্য (chart-এ আপনার indicator দেখতে চাইলে)।
        </div>
      </div>

      {/* Lorentzian matching helper — collapsed advanced section */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-xl overflow-hidden">
        <button
          onClick={() => setShowPine(!showPine)}
          className="w-full px-6 py-5 flex items-center justify-between hover:bg-slate-800/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Info className="w-5 h-5 text-slate-400" />
            <div className="text-left">
              <h3 className="text-base font-bold text-white">Advanced: TV Comparison Helper</h3>
              <p className="text-xs text-slate-400">শুধু TV-র সাথে number-by-number মিলিয়ে দেখতে চাইলে — auto-trade এর জন্য দরকার নেই</p>
            </div>
          </div>
          {showPine ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
        </button>

        {showPine && (
          <div className="px-6 pb-6 space-y-4 border-t border-slate-800 pt-5">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 leading-relaxed space-y-2">
              <p>
                <strong className="text-purple-300">Lorentzian exact match:</strong> training pool = dataset-এর প্রথম 2000 bars। TV chart-এ ঠিক কত bars load আছে সেটা plan-ভেদে আলাদা (5000 exact হয় না)। TV-তে exact bars বের করতে script-এর শেষে এটা যোগ করুন:
              </p>
              <pre className="bg-slate-900 rounded-xl p-3 text-[10px] font-mono text-cyan-300 overflow-x-auto border border-slate-800">
{`if barstate.islast
    label.new(bar_index, high, "Total Bars: " + str.tostring(last_bar_index + 1), color=color.blue, textcolor=color.white)`}
              </pre>
              <p>
                Chart-এ যে সংখ্যা দেখাবে সেটা উপরের <strong className="text-purple-300">"exact bars"</strong> box-এ লিখুন → Re-run Quantum Mind → "Lore last 10 bars" strip-এর সাথে TV-র prediction labels মিলান।
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
