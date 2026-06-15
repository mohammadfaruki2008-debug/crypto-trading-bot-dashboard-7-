import React from 'react';
import { 
  Bot, 
  Play, 
  Pause, 
  Zap, 
  ShieldCheck, 
  Server, 
  User, 
  LogOut, 
  RefreshCw 
} from 'lucide-react';
import { BotStatus } from '../types';

interface NavbarProps {
  botStatus: BotStatus;
  onToggleBotStatus: () => void;
  onOpenWebhookModal: () => void;
  onOpenIpModal: () => void;
  adminEmail: string;
  onLogout: () => void;
  connectionMode: string;
  isConnected: boolean;
  testnetMode?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  botStatus,
  onToggleBotStatus,
  onOpenWebhookModal,
  onOpenIpModal,
  adminEmail,
  onLogout,
  connectionMode,
  isConnected,
  testnetMode
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-6 py-3.5 flex items-center justify-between shadow-lg">
      {/* Brand Logo & Status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className={`absolute -inset-1 rounded-xl blur-sm opacity-70 ${
              botStatus === 'running' ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 animate-pulse' : 'bg-amber-500/50'
            }`} />
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 text-cyan-400 shadow-inner">
              <Bot className="w-6 h-6" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Quantum <span className="bg-gradient-to-r from-cyan-400 to-purple-300 bg-clip-text text-transparent">Mind</span>
              </h1>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 border ${
                botStatus === 'running'
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                  : 'bg-amber-950 text-amber-400 border-amber-800'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  botStatus === 'running' ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                }`} />
                {botStatus === 'running' ? 'Active Bot' : 'Paused'}
              </span>
              {testnetMode && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-950 text-amber-400 border border-amber-800 animate-pulse">
                  🧪 Testnet
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-3 mt-0.5">
              <span className="flex items-center gap-1 font-mono">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> AES-256 Encrypted Keys
              </span>
              <span className="text-slate-600">•</span>
              <span className="flex items-center gap-1 text-slate-300">
                <RefreshCw className={`w-3 h-3 text-cyan-400 ${isConnected ? 'animate-spin' : ''}`} /> 
                {connectionMode}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Center Utility Suite / Action Buttons */}
      <div className="flex items-center gap-3">
        {/* Toggle Bot Run / Pause button */}
        <button
          onClick={onToggleBotStatus}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-md ${
            botStatus === 'running'
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
              : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/20'
          }`}
        >
          {botStatus === 'running' ? (
            <>
              <Pause className="w-4 h-4 fill-current" />
              <span>Halt Execution</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>Start Bot Engine</span>
            </>
          )}
        </button>

        {/* TradingView Webhook Simulator button */}
        <button
          onClick={onOpenWebhookModal}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-all shadow-md shadow-cyan-600/20 border border-cyan-500/30"
        >
          <Zap className="w-4 h-4 text-amber-300 fill-amber-300 animate-bounce" />
          <span>Test Webhook Alert</span>
        </button>

        {/* Server IP Whitelist Assistant */}
        <button
          onClick={onOpenIpModal}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          title="Binance API Whitelist IP"
        >
          <Server className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Server IP</span>
        </button>
      </div>

      {/* Right User & Admin session Profile */}
      <div className="flex items-center gap-3 pl-4 border-l border-slate-800">
        <div className="flex items-center gap-2.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
          <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400">
            <User className="w-3.5 h-3.5" />
          </div>
          <div className="text-left hidden md:block">
            <div className="text-xs font-medium text-slate-200">{adminEmail}</div>
            <div className="text-[10px] text-emerald-400 font-mono tracking-tight">Operator Role</div>
          </div>
          <button
            onClick={onLogout}
            title="Log Out Admin"
            className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors ml-1"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
