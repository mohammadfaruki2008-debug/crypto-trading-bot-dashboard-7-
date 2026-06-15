import React, { useState } from 'react';
import { 
  Coins, 
  Plus, 
  Trash2, 
  X, 
  Sparkles, 
  Percent, 
  DollarSign, 
  Sliders,
  Clock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'];
import { TradeableCoin } from '../types';

interface CoinsViewProps {
  coins: TradeableCoin[];
  onAddCoin: (coin: Omit<TradeableCoin, 'id' | 'createdAt'>) => void;
  onToggleCoinActive: (id: string) => void;
  onDeleteCoin: (id: string) => void;
}

export const CoinsView: React.FC<CoinsViewProps> = ({
  coins,
  onAddCoin,
  onToggleCoinActive,
  onDeleteCoin
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [ticker, setTicker] = useState('AVAXUSDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [allocationType, setAllocationType] = useState<'percentage' | 'fixed_usdt'>('percentage');
  const [allocationValue, setAllocationValue] = useState(15);
  const [showTiers, setShowTiers] = useState(false);
  const [defaultStopLossPct, setDefaultStopLossPct] = useState(4.0);
  const [defaultTp1Pct, setDefaultTp1Pct] = useState(3.5);
  const [defaultTp2Pct, setDefaultTp2Pct] = useState(7.0);
  const [defaultTp3Pct, setDefaultTp3Pct] = useState(12.0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formattedTicker = ticker.trim().toUpperCase();
    if (!formattedTicker.endsWith('USDT')) {
      alert('Binance Spot pair must end with USDT (e.g. AVAXUSDT, NEARUSDT)');
      return;
    }

    const baseCoin = formattedTicker.replace('USDT', '');
    onAddCoin({
      ticker: formattedTicker,
      baseCoin,
      quoteCoin: 'USDT',
      timeframe,
      allocationType,
      allocationValue: parseFloat(allocationValue.toString()) || 10,
      defaultStopLossPct: parseFloat(defaultStopLossPct.toString()) || 3.5,
      defaultTp1Pct: parseFloat(defaultTp1Pct.toString()) || 3.0,
      defaultTp2Pct: parseFloat(defaultTp2Pct.toString()) || 6.0,
      defaultTp3Pct: parseFloat(defaultTp3Pct.toString()) || 10.0,
      isActive: true,
    });

    setIsAdding(false);
    setTicker('');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Header & Quick Add Button */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-left">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-amber-500/20">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Tradeable Coins Universe</h2>
              <p className="text-xs text-slate-400">Control which crypto assets the automated bot executes on Binance Spot</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-xl shadow-cyan-500/20 transition-all transform active:scale-95 shrink-0"
        >
          {isAdding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          <span>{isAdding ? 'Cancel New Coin' : 'Add Tradeable Pair'}</span>
        </button>
      </div>

      {/* Add New Coin Interactive Form Modal/Card */}
      {isAdding && (
        <form onSubmit={handleSubmit} className="bg-slate-900 border-2 border-cyan-500/40 rounded-3xl p-6 shadow-2xl space-y-6 text-left animate-in slide-in-from-top-4 duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" /> New Binance Spot Pair &amp; Automation Targets
            </h3>
            <span className="text-xs text-slate-400 font-mono">Auto creates DB record</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Ticker Input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Binance Spot Ticker</label>
              <input 
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                required
                placeholder="e.g. LINKUSDT"
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-white font-mono font-bold focus:outline-none focus:border-cyan-500 transition-colors uppercase"
              />
              <p className="text-[10px] text-slate-500">Must match Binance spot naming exactly</p>
            </div>

            {/* QUAD Monitor Timeframe */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-purple-400" /> Monitor Timeframe
              </label>
              <div className="grid grid-cols-5 gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800">
                {TIMEFRAMES.map(tf => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setTimeframe(tf)}
                    className={`py-2.5 rounded-xl text-xs font-bold font-mono transition-all ${
                      timeframe === tf ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500">QUAD engine এই TF-এ signal scan করবে</p>
            </div>

            {/* Position Sizing Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Position Sizing Method</label>
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-2xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setAllocationType('percentage');
                    setAllocationValue(15);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    allocationType === 'percentage' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Percent className="w-3.5 h-3.5" /> % Portfolio
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAllocationType('fixed_usdt');
                    setAllocationValue(500);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    allocationType === 'fixed_usdt' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" /> Fixed USDT
                </button>
              </div>
              <p className="text-[10px] text-slate-500">How much capital to deploy per trigger</p>
            </div>

            {/* Position Sizing Value */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                {allocationType === 'percentage' ? 'Allocation % of Account' : 'Fixed USDT Buy Order Size'}
              </label>
              <div className="relative flex items-center">
                <input 
                  type="number"
                  step="any"
                  value={allocationValue}
                  onChange={(e) => setAllocationValue(parseFloat(e.target.value) || 0)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 pl-4 pr-10 text-white font-mono font-bold focus:outline-none focus:border-cyan-500"
                />
                <span className="absolute right-4 text-xs font-bold text-cyan-400 font-mono">
                  {allocationType === 'percentage' ? '%' : 'USDT'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500">Auto verified against account balances</p>
            </div>
          </div>

          {/* Risk & Target tiers — OPTIONAL (collapsed by default, sensible defaults apply) */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowTiers(!showTiers)}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-900/50 transition-colors"
            >
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" /> Default Multi-Stage Execution Tiers
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[9px] font-mono normal-case">Optional</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                {!showTiers && <span>SL -{defaultStopLossPct}% • TP +{defaultTp1Pct}/{defaultTp2Pct}/{defaultTp3Pct}%</span>}
                {showTiers ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </div>
            </button>

            {showTiers && (
            <div className="px-5 pb-5 space-y-4">
            <p className="text-[10px] text-slate-500">না খুললে এই default মানগুলোই ব্যবহার হবে। QUAD signal এলে engine নিজের SL/TP দেয় — এগুলো শুধু fallback।</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs text-rose-300 font-medium">Initial Stop-Loss %</label>
                <div className="relative">
                  <input 
                    type="number" 
                    step="0.1" 
                    value={defaultStopLossPct}
                    onChange={(e) => setDefaultStopLossPct(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-rose-500/30 rounded-xl py-2 px-3 text-white font-mono text-sm focus:outline-none focus:border-rose-500"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-rose-400 font-mono">%</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-emerald-300 font-medium">Take Profit 1 % (Breakeven)</label>
                <div className="relative">
                  <input 
                    type="number" 
                    step="0.1" 
                    value={defaultTp1Pct}
                    onChange={(e) => setDefaultTp1Pct(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-emerald-500/30 rounded-xl py-2 px-3 text-white font-mono text-sm focus:outline-none focus:border-emerald-500"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-emerald-400 font-mono">%</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-emerald-300 font-medium">Take Profit 2 % (Trail SL)</label>
                <div className="relative">
                  <input 
                    type="number" 
                    step="0.1" 
                    value={defaultTp2Pct}
                    onChange={(e) => setDefaultTp2Pct(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-emerald-500/30 rounded-xl py-2 px-3 text-white font-mono text-sm focus:outline-none focus:border-emerald-500"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-emerald-400 font-mono">%</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-emerald-300 font-medium">Take Profit 3 % (Full Close)</label>
                <div className="relative">
                  <input 
                    type="number" 
                    step="0.1" 
                    value={defaultTp3Pct}
                    onChange={(e) => setDefaultTp3Pct(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-emerald-500/30 rounded-xl py-2 px-3 text-white font-mono text-sm focus:outline-none focus:border-emerald-500"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-emerald-400 font-mono">%</span>
                </div>
              </div>
            </div>
            </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-6 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-8 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-sm shadow-xl shadow-emerald-500/20 transition-all"
            >
              Save Coin to DB
            </button>
          </div>
        </form>
      )}

      {/* Grid of All Tradeable Coins */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {coins.map((coin) => {
          return (
            <div 
              key={coin.id}
              className={`p-6 rounded-3xl border transition-all text-left flex flex-col justify-between relative overflow-hidden group ${
                coin.isActive 
                  ? 'bg-slate-900 border-slate-800 shadow-xl hover:border-slate-700' 
                  : 'bg-slate-900/40 border-slate-900/80 opacity-75'
              }`}
            >
              {/* Top coin info */}
              <div>
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center font-bold text-lg text-cyan-400 font-mono shadow-inner">
                      {coin.baseCoin.slice(0, 3)}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white font-mono tracking-tight">{coin.ticker}</h3>
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-mono text-[10px] font-bold">
                          {coin.timeframe || '1h'}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="font-mono text-cyan-400">
                          {coin.allocationType === 'percentage' ? `${coin.allocationValue}% Portfolio` : `${coin.allocationValue.toLocaleString()} USDT`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    onClick={() => onToggleCoinActive(coin.id)}
                    title={coin.isActive ? "Click to Pause Automation for this pair" : "Click to Enable Automation"}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-1.5 ${
                      coin.isActive 
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80 hover:bg-emerald-900' 
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${coin.isActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
                    <span>{coin.isActive ? 'Active' : 'Disabled'}</span>
                  </button>
                </div>

                {/* Automation Parameters Card */}
                <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800/80 space-y-2.5 mb-6">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Default Stop-Loss:</span>
                    <span className="font-mono font-bold text-rose-400">-{coin.defaultStopLossPct}%</span>
                  </div>
                  
                  <div className="pt-2 border-t border-slate-800/60 space-y-1.5">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Take Profit Strategy:</div>
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-emerald-400/90 font-medium">TP1: +{coin.defaultTp1Pct}%</span>
                      <span className="text-emerald-400/90 font-medium">TP2: +{coin.defaultTp2Pct}%</span>
                      <span className="text-emerald-400 font-bold">TP3: +{coin.defaultTp3Pct}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Info & Delete */}
              <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-4">
                <span className="font-mono text-[11px]">
                  Added: {new Date(coin.createdAt).toLocaleDateString()}
                </span>
                <button
                  onClick={() => {
                    if (confirm(`Remove ${coin.ticker} from tradeable coins?`)) {
                      onDeleteCoin(coin.id);
                    }
                  }}
                  className="p-2 rounded-xl hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-colors"
                  title="Remove Coin Pair"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
