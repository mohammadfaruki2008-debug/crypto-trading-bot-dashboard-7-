import React, { useState } from 'react';
import { 
  Activity, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  FileJson, 
  Zap, 
  Search,
  X
} from 'lucide-react';
import { AlertLog } from '../types';

interface AlertLogsViewProps {
  alertLogs: AlertLog[];
  onClearLogs: () => void;
  onOpenWebhookModal: () => void;
}

export const AlertLogsView: React.FC<AlertLogsViewProps> = ({
  alertLogs,
  onClearLogs,
  onOpenWebhookModal
}) => {
  const [filterSource, setFilterSource] = useState<'all' | 'TradingView Webhook' | 'Gmail IMAP'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'Success' | 'Rejected' | 'Invalid Secret'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPayload, setSelectedPayload] = useState<any | null>(null);

  const filteredLogs = alertLogs.filter(log => {
    if (filterSource !== 'all' && log.source !== filterSource) return false;
    if (filterStatus !== 'all' && log.status !== filterStatus) return false;
    if (searchQuery && !log.ticker.toLowerCase().includes(searchQuery.toLowerCase()) && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Future-ready notice */}
      <div className="bg-amber-950/20 border border-amber-500/30 rounded-3xl p-5 flex items-start gap-3">
        <Activity className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-100/90 leading-relaxed">
          <strong className="text-amber-300">Future-Ready:</strong> এই page এ আপনার Express server (<code className="bg-slate-900 px-1 rounded text-amber-200">artifacts/api-server</code>) থেকে আসা সব TradingView Webhook ও Gmail IMAP alert log দেখাবে — যখন full stack deploy হবে ও TV Pro+ alert পাঠাবে। 
          এখন built-in QUAD engine থেকে আসা signal গুলো নিচে দেখানো হচ্ছে (QUAD ENGINE source badge সহ)।
        </div>
      </div>

      {/* Top Banner & Control Suite */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4 text-left">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-500/20">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">TradingView Webhook &amp; IMAP Logs</h2>
            <p className="text-xs text-slate-400">Inspecting authenticated alert streams hitting Express server</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenWebhookModal}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>Simulate Incoming Signal</span>
          </button>
          
          {alertLogs.length > 0 && (
            <button
              onClick={() => {
                if (confirm('Clear all historical alert logs?')) {
                  onClearLogs();
                }
              }}
              title="Clear DB Logs"
              className="p-2.5 rounded-2xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Suite */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950 p-4 rounded-3xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          {/* Source filter */}
          <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-2xl border border-slate-800/80 text-xs font-semibold font-mono">
            <span className="text-slate-500 pl-2">Source:</span>
            <button
              onClick={() => setFilterSource('all')}
              className={`px-3 py-1.5 rounded-xl transition-all ${filterSource === 'all' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              All
            </button>
            <button
              onClick={() => setFilterSource('TradingView Webhook')}
              className={`px-3 py-1.5 rounded-xl transition-all ${filterSource === 'TradingView Webhook' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              TradingView Webhook
            </button>
            <button
              onClick={() => setFilterSource('Gmail IMAP')}
              className={`px-3 py-1.5 rounded-xl transition-all ${filterSource === 'Gmail IMAP' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Gmail IMAP
            </button>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-2xl border border-slate-800/80 text-xs font-semibold font-mono">
            <span className="text-slate-500 pl-2">Status:</span>
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-2.5 py-1.5 rounded-xl transition-all ${filterStatus === 'all' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              All
            </button>
            <button
              onClick={() => setFilterStatus('Success')}
              className={`px-2.5 py-1.5 rounded-xl transition-all ${filterStatus === 'Success' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Success
            </button>
            <button
              onClick={() => setFilterStatus('Rejected')}
              className={`px-2.5 py-1.5 rounded-xl transition-all ${filterStatus === 'Rejected' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Rejected
            </button>
            <button
              onClick={() => setFilterStatus('Invalid Secret')}
              className={`px-2.5 py-1.5 rounded-xl transition-all ${filterStatus === 'Invalid Secret' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Invalid Secret
            </button>
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500 pointer-events-none" />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search payload or ticker..."
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-2.5 pl-10 pr-4 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl text-left">
        {filteredLogs.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <Activity className="w-10 h-10 text-slate-600 mx-auto animate-pulse" />
            <p className="text-sm font-semibold text-slate-300">No alert logs match your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono bg-slate-950/50">
                  <th className="py-3.5 px-6">Timestamp</th>
                  <th className="py-3.5 px-6">Source</th>
                  <th className="py-3.5 px-6">Pair / Action</th>
                  <th className="py-3.5 px-6">Validation Status</th>
                  <th className="py-3.5 px-6">Operational Log Message</th>
                  <th className="py-3.5 px-6 text-right">Raw JSON Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs font-mono">
                {filteredLogs.map((log) => {
                  return (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-4 px-6 text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString()} <span className="text-[10px] text-slate-600 block">{new Date(log.timestamp).toLocaleDateString()}</span>
                      </td>

                      <td className="py-4 px-6 font-semibold text-white whitespace-nowrap">
                        <span className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${log.source === 'TradingView Webhook' ? 'bg-cyan-400' : 'bg-amber-400'}`} />
                          <span>{log.source}</span>
                        </span>
                      </td>

                      <td className="py-4 px-6 font-bold text-white whitespace-nowrap">
                        <span className="text-sm font-sans">{log.ticker}</span> <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded ml-1 font-mono uppercase">{log.action}</span>
                      </td>

                      <td className="py-4 px-6 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 w-max ${
                          log.status === 'Success' 
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80' 
                            : log.status === 'Rejected'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800/80'
                            : 'bg-rose-950 text-rose-400 border border-rose-800/80'
                        }`}>
                          {log.status === 'Success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                          {log.status === 'Rejected' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                          {log.status === 'Invalid Secret' && <XCircle className="w-3.5 h-3.5 text-rose-400" />}
                          <span>{log.status}</span>
                        </span>
                      </td>

                      <td className="py-4 px-6 text-slate-300 font-sans text-xs leading-relaxed max-w-md">
                        {log.message}
                      </td>

                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        {log.payload ? (
                          <button
                            onClick={() => setSelectedPayload(log.payload)}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-[11px] inline-flex items-center gap-1.5 transition-colors"
                          >
                            <FileJson className="w-3.5 h-3.5" />
                            <span>Inspect Payload</span>
                          </button>
                        ) : (
                          <span className="text-slate-600 text-[11px]">No body</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payload JSON Inspector Modal */}
      {selectedPayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="relative max-w-xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-left space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2 font-mono">
                <FileJson className="w-4 h-4 text-cyan-400" /> Incoming JSON Alert Body
              </h3>
              <button 
                onClick={() => setSelectedPayload(null)} 
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 overflow-x-auto max-h-96">
              <pre className="text-xs font-mono text-cyan-300 leading-relaxed">
                {JSON.stringify(selectedPayload, null, 2)}
              </pre>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedPayload(null)}
                className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
