import React, { useState } from 'react';
import { 
  Layers, 
  ShieldCheck, 
  AlertOctagon, 
  Sparkles, 
  ArrowUpRight, 
  TrendingDown, 
  Zap, 
  Lock, 
  Unlock, 
  Search,
  Check
} from 'lucide-react';
import { TradePosition, LiveTicker } from '../types';

interface PositionsViewProps {
  positions: TradePosition[];
  tickers: Record<string, LiveTicker>;
  onClosePosition: (id: string, closePrice: number) => void;
  onForceMoveSlToBreakeven: (id: string) => void;
  onSimulateTpBreakout: (id: string) => void;
  onOpenWebhookModal: () => void;
}

export const PositionsView: React.FC<PositionsViewProps> = ({
  positions,
  tickers,
  onClosePosition,
  onForceMoveSlToBreakeven,
  onSimulateTpBreakout,
  onOpenWebhookModal
}) => {
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPositions = positions.filter(pos => {
    if (filter === 'open' && pos.status !== 'open') return false;
    if (filter === 'closed' && pos.status === 'open') return false;
    if (searchQuery && !pos.ticker.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const openCount = positions.filter(p => p.status === 'open').length;
  const closedCount = positions.filter(p => p.status !== 'open').length;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* View Control Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4 text-left">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-emerald-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Active Spot Execution Hub</h2>
              <p className="text-xs text-slate-400">Live order status monitor &amp; trailing Stop-Loss management floor</p>
            </div>
          </div>
        </div>

        {/* Filter & Search Suite */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
          <div className="relative flex-1 sm:w-60">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500 pointer-events-none" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter pair..."
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-2.5 pl-10 pr-4 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800 font-mono text-xs font-semibold shrink-0">
            <button
              onClick={() => setFilter('open')}
              className={`px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
                filter === 'open' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Open</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-900 text-cyan-300 text-[10px]">{openCount}</span>
            </button>
            <button
              onClick={() => setFilter('closed')}
              className={`px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
                filter === 'closed' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>History</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-900 text-slate-300 text-[10px]">{closedCount}</span>
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-2 rounded-xl transition-all ${
                filter === 'all' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {/* Main Trade Floor Cards / List */}
      {filteredPositions.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-16 text-center space-y-4 shadow-xl">
          <AlertOctagon className="w-12 h-12 text-slate-600 mx-auto animate-pulse" />
          <h3 className="text-lg font-bold text-white">No spot trades match criteria</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            When TradingView alert webhooks or Gmail IMAP triggers arrive, automated buy orders execute on Binance Spot and populate here instantly.
          </p>
          <div className="pt-2">
            <button
              onClick={onOpenWebhookModal}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs inline-flex items-center gap-2 shadow-lg shadow-cyan-500/20"
            >
              <Sparkles className="w-4 h-4" /> Try Webhook Alert Simulator Now
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredPositions.map((pos) => {
            const isOpen = pos.status === 'open';
            const liveTicker = tickers[pos.ticker] || { price: pos.currentPrice };
            const currentLivePrice = isOpen ? liveTicker.price : pos.currentPrice;
            const livePnlUsdt = ((currentLivePrice - pos.buyPrice) / pos.buyPrice) * pos.amount;
            const livePnlPct = ((currentLivePrice - pos.buyPrice) / pos.buyPrice) * 100;
            const isProfit = livePnlUsdt >= 0;

            return (
              <div 
                key={pos.id}
                className={`rounded-3xl border transition-all text-left overflow-hidden shadow-xl ${
                  isOpen ? 'bg-slate-900 border-slate-800 hover:border-slate-700' : 'bg-slate-900/40 border-slate-900/80 opacity-80'
                }`}
              >
                {/* Top Status Bar */}
                <div className={`px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b ${
                  isOpen ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-950/30 border-slate-900'
                }`}>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 uppercase ${
                      isOpen 
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80' 
                        : pos.status === 'closed_tp'
                        ? 'bg-blue-950 text-blue-400 border border-blue-800/80'
                        : pos.status === 'closed_sl'
                        ? 'bg-rose-950 text-rose-400 border border-rose-800/80'
                        : 'bg-slate-800 text-slate-300'
                    }`}>
                      {isOpen && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
                      <span>{isOpen ? 'Active Position' : pos.status.replace('_', ' ')}</span>
                    </span>

                    <span className="text-sm font-bold text-white font-mono flex items-center gap-2">
                      <span>{pos.ticker}</span>
                      <span className="text-xs font-sans font-normal text-slate-400">({pos.action.toUpperCase()})</span>
                    </span>

                    <span className="text-xs text-slate-500 font-mono hidden sm:inline">
                      ID: {pos.id}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-slate-400">Invested Capital:</span>
                    <span className="text-white font-bold">{pos.amount.toLocaleString()} USDT</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-cyan-400">{pos.tokens.toFixed(4)} Units</span>
                  </div>
                </div>

                {/* Main Body */}
                <div className="p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                    {/* Column 1: Prices & Real-time Profit */}
                    <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Spot Entry Price</div>
                        <div className="text-base font-bold text-white font-mono mt-1">
                          {pos.buyPrice.toLocaleString()} USDT
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{new Date(pos.openedAt).toLocaleTimeString()}</div>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Current Spot Price</div>
                        <div className="text-base font-bold text-cyan-300 font-mono mt-1">
                          {currentLivePrice.toLocaleString()} USDT
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Linked to live Feed</div>
                      </div>

                      <div className={`p-4 rounded-2xl border col-span-2 sm:col-span-1 ${
                        isProfit ? 'bg-emerald-950/30 border-emerald-500/40' : 'bg-rose-950/30 border-rose-500/40'
                      }`}>
                        <div className="text-[10px] uppercase font-bold text-slate-400">Dynamic PnL</div>
                        <div className={`text-lg font-bold font-mono mt-1 flex items-center gap-1 ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isProfit ? <ArrowUpRight className="w-4 h-4 shrink-0" /> : <TrendingDown className="w-4 h-4 shrink-0" />}
                          <span>{isProfit ? '+' : ''}{livePnlUsdt.toFixed(2)} USDT</span>
                        </div>
                        <div className={`text-xs font-mono font-semibold mt-0.5 ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ({isProfit ? '+' : ''}{livePnlPct.toFixed(2)}%)
                        </div>
                      </div>
                    </div>

                    {/* Column 2: Trailing Take Profit Multi-Tier Tracker */}
                    <div className="lg:col-span-7 bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                          <span className="font-bold text-slate-200">Take Profit Strategy Executions</span>
                        </div>
                        <span className="text-[11px] text-slate-400">Split tier automation target</span>
                      </div>

                      {/* Visual 3-Stage TP Bars */}
                      <div className="grid grid-cols-3 gap-3">
                        {/* TP 1 */}
                        <div className={`p-3 rounded-xl border text-center transition-all relative overflow-hidden ${
                          pos.tp1Status === 'filled' 
                            ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 shadow-lg shadow-emerald-950/50' 
                            : 'bg-slate-900/60 border-slate-800 text-slate-400 opacity-90'
                        }`}>
                          {pos.tp1Status === 'filled' && (
                            <div className="absolute top-0 right-0 p-1">
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            </div>
                          )}
                          <div className="text-[10px] font-bold uppercase">TP 1 (Breakeven Tier)</div>
                          <div className="text-xs font-mono font-bold text-white mt-1">{pos.tp1.toLocaleString()} USDT</div>
                          <div className="mt-1 text-[10px] font-mono">
                            {pos.tp1Status === 'filled' ? '✅ 33% Solved' : '⏳ Pending'}
                          </div>
                        </div>

                        {/* TP 2 */}
                        <div className={`p-3 rounded-xl border text-center transition-all relative overflow-hidden ${
                          pos.tp2Status === 'filled' 
                            ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 shadow-lg shadow-emerald-950/50' 
                            : 'bg-slate-900/60 border-slate-800 text-slate-400 opacity-90'
                        }`}>
                          {pos.tp2Status === 'filled' && (
                            <div className="absolute top-0 right-0 p-1">
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            </div>
                          )}
                          <div className="text-[10px] font-bold uppercase">TP 2 (Trail SL Tier)</div>
                          <div className="text-xs font-mono font-bold text-white mt-1">{pos.tp2.toLocaleString()} USDT</div>
                          <div className="mt-1 text-[10px] font-mono">
                            {pos.tp2Status === 'filled' ? '✅ 33% Solved' : '⏳ Pending'}
                          </div>
                        </div>

                        {/* TP 3 */}
                        <div className={`p-3 rounded-xl border text-center transition-all relative overflow-hidden ${
                          pos.tp3Status === 'filled' 
                            ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 shadow-lg shadow-emerald-950/50' 
                            : 'bg-slate-900/60 border-slate-800 text-slate-400 opacity-90'
                        }`}>
                          {pos.tp3Status === 'filled' && (
                            <div className="absolute top-0 right-0 p-1">
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            </div>
                          )}
                          <div className="text-[10px] font-bold uppercase">TP 3 (Final Breakout)</div>
                          <div className="text-xs font-mono font-bold text-white mt-1">{pos.tp3.toLocaleString()} USDT</div>
                          <div className="mt-1 text-[10px] font-mono">
                            {pos.tp3Status === 'filled' ? '✅ Full Close' : '⏳ Pending'}
                          </div>
                        </div>
                      </div>

                      {/* Stop Loss Trailing Info Bar */}
                      <div className="bg-slate-900 p-3 rounded-xl border border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Stop-Loss Trailing Level:</span>
                          <span className="font-bold text-white">{pos.currentSl.toLocaleString()} USDT</span>
                        </div>
                        <div>
                          {pos.slMovedToBreakeven ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 text-[11px] flex items-center gap-1 font-semibold">
                              <Lock className="w-3 h-3 text-emerald-400" /> Auto-Trailed to Breakeven Buy
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800/80 text-amber-300 text-[11px] flex items-center gap-1 font-semibold">
                              <Unlock className="w-3 h-3 text-amber-400" /> Initial SL Active ({pos.initialSl.toLocaleString()})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Emergency / Simulation Actions (Only for open trades) */}
                  {isOpen && (
                    <div className="mt-6 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
                      <div className="text-xs text-slate-500">
                        Signal source: <code className="text-slate-400 font-mono font-bold">{pos.source}</code>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        {/* Simulation 1: Trigger next TP breakout */}
                        <button
                          onClick={() => onSimulateTpBreakout(pos.id)}
                          title="Simulate a live price surge hitting the next Take Profit tier"
                          className="px-4 py-2.5 rounded-xl bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/80 text-xs font-semibold font-mono flex items-center gap-2 transition-colors"
                        >
                          <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300 animate-bounce" />
                          <span>Simulate TP Surge</span>
                        </button>

                        {/* Simulation 2: Override SL Breakeven */}
                        {!pos.slMovedToBreakeven && (
                          <button
                            onClick={() => onForceMoveSlToBreakeven(pos.id)}
                            title="Force Trailing Stop Loss to Breakeven Buy Price right now"
                            className="px-4 py-2.5 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/80 text-xs font-semibold font-mono flex items-center gap-1.5 transition-colors"
                          >
                            <Lock className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Lock Trailing Breakeven</span>
                          </button>
                        )}

                        {/* Force Close Position */}
                        <button
                          onClick={() => {
                            if (confirm(`Emergency Market Close position ${pos.ticker} at current market price of ${currentLivePrice} USDT?`)) {
                              onClosePosition(pos.id, currentLivePrice);
                            }
                          }}
                          className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-rose-600/20"
                        >
                          <span>Market Exit Position</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {!isOpen && (
                    <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-500 font-mono">
                      <span>Closed At: {pos.closedAt ? new Date(pos.closedAt).toLocaleString() : 'N/A'}</span>
                      <span className="text-slate-400">Final Realized Net: <strong className={pos.pnlUsdt >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{pos.pnlUsdt >= 0 ? '+' : ''}{pos.pnlUsdt.toFixed(2)} USDT</strong></span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
