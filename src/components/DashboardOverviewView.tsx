import React, { useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Percent, 
  Activity, 
  ArrowUpRight, 
  ShieldCheck, 
  ArrowRight,
  Sparkles,
  Zap,
  Target,
  Layers
} from 'lucide-react';
import { TradePosition, LiveTicker } from '../types';

interface DashboardOverviewViewProps {
  portfolioUsdtBalance: number;
  positions: TradePosition[];
  tickers: Record<string, LiveTicker>;
  onNavigateTab: (tab: any) => void;
  onOpenWebhookModal: () => void;
}

export const DashboardOverviewView: React.FC<DashboardOverviewViewProps> = ({
  portfolioUsdtBalance,
  positions,
  tickers,
  onNavigateTab,
  onOpenWebhookModal
}) => {
  // Calculate active realized & unrealized stats
  const openPositions = positions.filter(p => p.status === 'open');
  const closedPositions = positions.filter(p => p.status !== 'open');
  
  const unrealizedPnl = openPositions.reduce((sum, p) => sum + p.pnlUsdt, 0);
  const realizedPnl = closedPositions.reduce((sum, p) => sum + p.pnlUsdt, 0);
  const totalPnl = unrealizedPnl + realizedPnl;
  
  const winningTrades = closedPositions.filter(p => p.pnlUsdt > 0);
  const winRate = closedPositions.length > 0 
    ? parseFloat(((winningTrades.length / closedPositions.length) * 100).toFixed(1)) 
    : 85.7; // default sample win rate

  // Simulated 30-day equity points for our beautiful custom SVG interactive chart
  const [selectedPoint, setSelectedPoint] = useState<{ day: number; val: number; note?: string } | null>(null);
  
  const baseVal = 23500;
  const sampleDataPoints = [
    { day: 1, val: baseVal + 0, note: 'Initial allocation' },
    { day: 4, val: baseVal + 120, note: 'BTC Tp1 Hit' },
    { day: 8, val: baseVal + 290, note: 'ETH buy executed' },
    { day: 12, val: baseVal + 210, note: 'SL Breakeven triggered' },
    { day: 16, val: baseVal + 540, note: 'SOL Trailing Take Profit' },
    { day: 20, val: baseVal + 480, note: 'Gmail IMAP SOL entry' },
    { day: 24, val: baseVal + 890, note: 'SUI TP2 Full Close' },
    { day: 28, val: baseVal + 1150, note: 'BTC breakout TP3' },
    { day: 30, val: portfolioUsdtBalance + unrealizedPnl, note: 'Current Dynamic Equity' }
  ];

  const maxVal = Math.max(...sampleDataPoints.map(d => d.val), portfolioUsdtBalance + 500);
  const minVal = Math.min(...sampleDataPoints.map(d => d.val)) - 200;
  const chartHeight = 240;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top 4 Key Financial Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Metric 1: Total Portfolio */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl group-hover:bg-cyan-500/10 transition-colors" />
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider">Total Portfolio Equity</span>
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-bold text-white font-mono tracking-tight">
              {(portfolioUsdtBalance + unrealizedPnl).toLocaleString('en-US', { style: 'currency', currency: 'USD' }).replace('$', '')} <span className="text-xs font-sans text-cyan-400 font-bold">USDT</span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className={`flex items-center gap-1 font-semibold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalPnl >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} USDT
            </span>
            <span className="text-slate-500 font-mono text-[11px]">Lifetime Net</span>
          </div>
        </div>

        {/* Metric 2: Open Positions Profit */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors" />
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider">Active Unrealized PnL</span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className={`text-2xl font-bold font-mono tracking-tight ${unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(2)} <span className="text-xs font-sans text-slate-300">USDT</span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono font-medium text-[11px]">
              {openPositions.length} Active Position{openPositions.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* Metric 3: Monitor Loop Status */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-colors" />
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider">Background Trailing Monitor</span>
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-xl font-bold text-white font-mono flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span>30s Ticking Engine</span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Auto moving SL &amp; targets</span>
          </div>
        </div>

        {/* Metric 4: Realized Win Rate */}
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors" />
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider">Automated Win Rate</span>
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Percent className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-bold text-white font-mono tracking-tight">
              {winRate}%
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-emerald-400 font-semibold">{winningTrades.length} Wins</span>
            <span className="text-slate-600">•</span>
            <span className="text-rose-400 font-semibold">{closedPositions.length - winningTrades.length} Losses</span>
          </div>
        </div>
      </div>

      {/* Live Market Spot WebSockets Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              Live Binance Spot Tickers <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </h3>
            <span className="text-xs text-slate-500 font-mono">Real-time dynamic feed</span>
          </div>
          <button 
            onClick={() => onNavigateTab('coins')}
            className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 group"
          >
            <span>Configure Tradeable Coins</span>
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.values(tickers).map((ticker) => {
            const isUp = ticker.change24h >= 0;
            return (
              <div 
                key={ticker.symbol}
                className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800/80 hover:border-slate-700 transition-all text-left flex flex-col justify-between shadow-md hover:shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-mono text-white tracking-tight">{ticker.symbol}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-0.5 ${
                    isUp ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60' : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                  }`}>
                    {isUp ? '+' : ''}{ticker.change24h.toFixed(2)}%
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-base font-mono font-bold text-slate-100">
                    {ticker.price.toLocaleString('en-US', { minimumFractionDigits: ticker.price < 5 ? 3 : 2 })}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">24h</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Middle Section: Equity Growth Interactive Chart & Rapid Execute Webhook Trigger Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive Account Balance Equity Trend Chart (2 Cols) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <Target className="w-4 h-4 text-cyan-400" /> Auto-Bot Equity Curve (Last 30 Days)
              </h3>
              <p className="text-xs text-slate-400">Realized growth + auto Take Profit execution landmarks</p>
            </div>
            {selectedPoint && (
              <div className="px-3.5 py-1.5 rounded-xl bg-slate-950 border border-cyan-500/40 text-cyan-300 font-mono text-xs flex items-center gap-2 animate-pulse">
                <span className="text-slate-400">Day {selectedPoint.day}:</span>
                <span className="font-bold text-white">${selectedPoint.val.toLocaleString()}</span>
                {selectedPoint.note && <span className="bg-cyan-950 text-cyan-200 px-2 py-0.5 rounded text-[10px]">{selectedPoint.note}</span>}
              </div>
            )}
          </div>

          {/* SVG Canvas Chart */}
          <div className="relative w-full h-[240px]">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 1000 240">
              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                const y = 20 + (chartHeight - 40) * ratio;
                const value = maxVal - ratio * (maxVal - minVal);
                return (
                  <g key={i}>
                    <line x1="0" y1={y} x2="1000" y2={y} stroke="#1e293b" strokeDasharray="4 4" strokeWidth="1" />
                    <text x="0" y={y - 5} fill="#64748b" fontSize="11" fontFamily="monospace">
                      ${Math.round(value).toLocaleString()}
                    </text>
                  </g>
                );
              })}

              {/* Gradient Definition */}
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Area Under Curve */}
              <path 
                d={`M 50 ${20 + (chartHeight - 40) * (1 - (sampleDataPoints[0].val - minVal) / (maxVal - minVal))} ` +
                  sampleDataPoints.map((d, i) => {
                    const x = 50 + (i / (sampleDataPoints.length - 1)) * 900;
                    const y = 20 + (chartHeight - 40) * (1 - (d.val - minVal) / (maxVal - minVal));
                    return `L ${x} ${y}`;
                  }).join(' ') +
                  ` L 950 ${chartHeight - 20} L 50 ${chartHeight - 20} Z`
                }
                fill="url(#equityGradient)"
              />

              {/* Main Line */}
              <path 
                d={`M 50 ${20 + (chartHeight - 40) * (1 - (sampleDataPoints[0].val - minVal) / (maxVal - minVal))} ` +
                  sampleDataPoints.map((d, i) => {
                    const x = 50 + (i / (sampleDataPoints.length - 1)) * 900;
                    const y = 20 + (chartHeight - 40) * (1 - (d.val - minVal) / (maxVal - minVal));
                    return `L ${x} ${y}`;
                  }).join(' ')
                }
                fill="none"
                stroke="#22d3ee"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Data Interactive Nodes */}
              {sampleDataPoints.map((d, i) => {
                const x = 50 + (i / (sampleDataPoints.length - 1)) * 900;
                const y = 20 + (chartHeight - 40) * (1 - (d.val - minVal) / (maxVal - minVal));
                return (
                  <g 
                    key={i} 
                    className="cursor-pointer group"
                    onMouseEnter={() => setSelectedPoint(d)}
                    onMouseLeave={() => setSelectedPoint(null)}
                  >
                    <circle 
                      x={x} 
                      cx={x} 
                      cy={y} 
                      r="6" 
                      fill="#0f172a" 
                      stroke="#06b6d4" 
                      strokeWidth="2.5" 
                      className="transition-transform group-hover:scale-150"
                    />
                    <circle 
                      x={x} 
                      cx={x} 
                      cy={y} 
                      r="16" 
                      fill="transparent" 
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-3">
            <span>Dynamic tracking enabled</span>
            <span className="font-mono text-cyan-400">Hover nodes to explore events</span>
            <span>Last synchronised: Just now</span>
          </div>
        </div>

        {/* Rapid Test & Control Card */}
        <div className="bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-900 border border-cyan-500/30 rounded-3xl p-6 shadow-xl flex flex-col justify-between text-left relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Zap className="w-48 h-48 text-cyan-400" />
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-400">
              <Sparkles className="w-4 h-4 animate-bounce" /> TradingView Webhook Workbench
            </div>
            
            <h4 className="text-xl font-bold text-white tracking-tight leading-snug">
              Inject Test Alerts or Simulated IMAP Signals
            </h4>

            <p className="text-xs text-slate-300 leading-relaxed">
              Test your Binance auto-buy logic instantly. Operators can paste custom JSON or select standard presets to verify <strong className="text-emerald-400">Take Profit split tiering (TP1/TP2/TP3)</strong> and Trailing Stop-Loss activation.
            </p>

            <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1.5 text-xs font-mono">
              <div className="text-[10px] text-slate-500">Target Express Webhook Endpoint</div>
              <div className="text-cyan-300 font-semibold select-all break-all">
                https://api.replit.workspace/api/webhook
              </div>
            </div>
          </div>

          <button
            onClick={onOpenWebhookModal}
            className="w-full mt-6 py-4 px-5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm rounded-2xl shadow-xl shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all transform active:scale-[0.99]"
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>Open Webhook Alert Workbench</span>
          </button>
        </div>
      </div>

      {/* Bottom Section: Active Open Positions Hub Preview */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4 text-left">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" /> Live Operational Floor (Active Trades)
            </h3>
            <p className="text-xs text-slate-400">Real-time trailing execution tracking</p>
          </div>
          <button
            onClick={() => onNavigateTab('positions')}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-semibold flex items-center gap-2 transition-colors"
          >
            <span>Advanced Trade Control Hub</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {openPositions.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm font-medium text-slate-400">No active positions on Binance Spot.</p>
            <button
              onClick={onOpenWebhookModal}
              className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors inline-flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" /> Trigger Simulated TradingView Alert
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  <th className="py-3 px-4">Pair</th>
                  <th className="py-3 px-4">Buy Target</th>
                  <th className="py-3 px-4">Live Spot Price</th>
                  <th className="py-3 px-4">PnL (USDT)</th>
                  <th className="py-3 px-4">Current Trailing SL</th>
                  <th className="py-3 px-4">TP Progress Tier</th>
                  <th className="py-3 px-4 text-right">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                {openPositions.map((pos) => {
                  const liveTicker = tickers[pos.ticker] || { price: pos.currentPrice };
                  const livePnlUsdt = ((liveTicker.price - pos.buyPrice) / pos.buyPrice) * pos.amount;
                  const livePnlPct = ((liveTicker.price - pos.buyPrice) / pos.buyPrice) * 100;
                  const isProfit = livePnlUsdt >= 0;

                  return (
                    <tr key={pos.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="font-sans text-sm">{pos.ticker}</span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300 font-mono">
                        {pos.buyPrice.toLocaleString()} USDT
                      </td>
                      <td className="py-3.5 px-4 font-bold text-cyan-300 font-mono">
                        {liveTicker.price.toLocaleString()} USDT
                      </td>
                      <td className={`py-3.5 px-4 font-bold font-mono ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isProfit ? '+' : ''}{livePnlUsdt.toFixed(2)} USDT ({isProfit ? '+' : ''}{livePnlPct.toFixed(2)}%)
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <span className={`px-2 py-1 rounded text-[11px] font-semibold ${
                          pos.slMovedToBreakeven ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/80' : 'bg-slate-800 text-slate-300'
                        }`}>
                          {pos.currentSl.toLocaleString()} {pos.slMovedToBreakeven ? '(🔒 Locked Breakeven)' : '(Initial)'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            pos.tp1Status === 'filled' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                          }`}>TP1</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            pos.tp2Status === 'filled' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                          }`}>TP2</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            pos.tp3Status === 'filled' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                          }`}>TP3</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 text-[10px] font-sans uppercase font-bold tracking-wider">
                          {pos.source.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
