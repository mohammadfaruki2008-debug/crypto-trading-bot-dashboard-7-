import React, { useState } from 'react';
import { 
  Terminal, 
  Trash2, 
  RefreshCw
} from 'lucide-react';
import { MonitorLog } from '../types';

interface MonitorConsoleProps {
  monitorLogs: MonitorLog[];
  onTriggerMonitorLoop: () => void;
  onClearLogs: () => void;
}

export const MonitorConsoleView: React.FC<MonitorConsoleProps> = ({
  monitorLogs,
  onTriggerMonitorLoop,
  onClearLogs
}) => {
  const [filterLevel, setFilterLevel] = useState<'all' | 'success' | 'info' | 'warn' | 'error'>('all');
  const [filterCategory, setFilterCategory] = useState<'all' | 'Monitor' | 'Binance API' | 'Trading Engine' | 'Security'>('all');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [isLooping, setIsLooping] = useState<boolean>(false);

  const handleManualSync = () => {
    setIsLooping(true);
    onTriggerMonitorLoop();
    setTimeout(() => setIsLooping(false), 800);
  };

  const filteredLogs = monitorLogs.filter(log => {
    if (filterLevel !== 'all' && log.level !== filterLevel) return false;
    if (filterCategory !== 'all' && log.category !== filterCategory) return false;
    return true;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Controller Suite */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4 text-left">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-amber-500/20">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>Background Trailing Monitor Daemon</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            </h2>
            <p className="text-xs text-slate-400">
              <code className="text-cyan-400 font-mono">monitor.ts</code> runs every 30s • Validating Spot API TP1/TP2/TP3 fills
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleManualSync}
            disabled={isLooping}
            className="px-5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLooping ? 'animate-spin' : ''}`} />
            <span>Force 30s Loop Execution Now</span>
          </button>

          {monitorLogs.length > 0 && (
            <button
              onClick={() => {
                if (confirm('Clear monitor console logs?')) {
                  onClearLogs();
                }
              }}
              title="Clear Terminal Display"
              className="p-3 rounded-2xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Terminal View Workbench */}
      <div className="bg-slate-950 border-2 border-slate-800 rounded-3xl shadow-2xl overflow-hidden font-mono flex flex-col text-left">
        {/* Terminal Header Bar */}
        <div className="bg-slate-900/90 px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs select-none">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 mr-2">
              <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
            </div>
            <span className="text-slate-400 font-bold tracking-tight">binance-automata@spot-server:~# terminal</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            {/* Filter Pill */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button 
                onClick={() => setFilterLevel('all')}
                className={`px-2 py-0.5 rounded-lg ${filterLevel === 'all' ? 'bg-cyan-800 text-white' : 'text-slate-400'}`}
              >All</button>
              <button 
                onClick={() => setFilterLevel('success')}
                className={`px-2 py-0.5 rounded-lg ${filterLevel === 'success' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'text-slate-400'}`}
              >Success</button>
              <button 
                onClick={() => setFilterLevel('info')}
                className={`px-2 py-0.5 rounded-lg ${filterLevel === 'info' ? 'bg-blue-950 text-blue-400 border border-blue-800' : 'text-slate-400'}`}
              >Info</button>
              <button 
                onClick={() => setFilterLevel('warn')}
                className={`px-2 py-0.5 rounded-lg ${filterLevel === 'warn' ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'text-slate-400'}`}
              >Warn</button>
            </div>

            {/* Category Filter */}
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1 text-slate-300 focus:outline-none"
            >
              <option value="all">All Subsystems</option>
              <option value="Monitor">Monitor Job</option>
              <option value="Binance API">Binance API</option>
              <option value="Trading Engine">Trading Engine</option>
              <option value="Security">Security Encryption</option>
            </select>

            {/* Auto scroll toggle */}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl transition-colors ${
                autoScroll ? 'bg-slate-800 text-emerald-400' : 'bg-slate-900 text-slate-500'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoScroll ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span>Auto-Scroll</span>
            </button>
          </div>
        </div>

        {/* Console Streaming Logs Body */}
        <div className="p-6 overflow-y-auto max-h-[500px] space-y-3 font-mono text-xs selection:bg-cyan-500 selection:text-slate-950">
          <div className="text-slate-500 pb-2 border-b border-slate-900 flex items-center justify-between">
            <span>Started background ticker session. Process ID: #84902</span>
            <span className="text-emerald-400 font-bold">● Binance WebSocket streaming ready</span>
          </div>

          {filteredLogs.map((log) => {
            const isSucc = log.level === 'success';
            const isWarn = log.level === 'warn';
            const isErr = log.level === 'error';

            return (
              <div 
                key={log.id}
                className={`p-3 rounded-xl border transition-colors flex flex-col sm:flex-row items-start gap-3 ${
                  isSucc ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300' :
                  isWarn ? 'bg-amber-950/20 border-amber-500/20 text-amber-300' :
                  isErr ? 'bg-rose-950/20 border-rose-500/20 text-rose-300' :
                  'bg-slate-900/40 border-slate-800/80 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                  <span className="text-slate-500 text-[11px]">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                    log.category === 'Security' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' :
                    log.category === 'Trading Engine' ? 'bg-purple-950 text-purple-300 border border-purple-800' :
                    log.category === 'Binance API' ? 'bg-blue-950 text-blue-300 border border-blue-800' :
                    'bg-slate-800 text-slate-300'
                  }`}>
                    {log.category}
                  </span>
                </div>

                <div className="flex-1 text-slate-200 font-mono break-all sm:break-normal leading-relaxed">
                  {log.message}
                </div>
              </div>
            );
          })}
        </div>

        {/* Input prompt simulator footer */}
        <div className="bg-slate-900/60 px-5 py-3 border-t border-slate-800 flex items-center justify-between text-slate-400 text-xs">
          <div className="flex items-center gap-2 w-full">
            <span className="text-emerald-400 font-bold animate-pulse">&gt;</span>
            <span className="text-slate-300 font-mono">Daemon Active Loop ... Next inspection check in 14s</span>
          </div>
          <span className="text-[10px] text-slate-500 shrink-0 font-mono">AES-256-GCM State: Rest Encrypted</span>
        </div>
      </div>
    </div>
  );
};
