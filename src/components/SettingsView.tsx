import React from 'react';
import { 
  Settings2, 
  ShieldCheck,
  Power,
  Crosshair,
  TrendingUp,
  Bot,
  Code2,
  FlaskConical,
  SlidersHorizontal,
  Layers,
  ArrowRight
} from 'lucide-react';
import { BotConfig } from '../types';

interface SettingsViewProps {
  botConfig: BotConfig;
  onUpdateBotConfig: (newConfig: BotConfig) => void;
  onNavigateToSecurity: () => void;
}

// Reusable premium iOS-style Toggle Switch
const ToggleSwitch: React.FC<{
  enabled: boolean;
  onToggle: () => void;
  accent?: 'cyan' | 'emerald' | 'amber' | 'purple' | 'rose';
}> = ({ enabled, onToggle, accent = 'cyan' }) => {
  const accentBg: Record<string, string> = {
    cyan: 'bg-cyan-500 shadow-cyan-500/40',
    emerald: 'bg-emerald-500 shadow-emerald-500/40',
    amber: 'bg-amber-500 shadow-amber-500/40',
    purple: 'bg-purple-500 shadow-purple-500/40',
    rose: 'bg-rose-500 shadow-rose-500/40',
  };
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative shrink-0 w-12 h-7 rounded-full transition-all duration-300 border ${
        enabled
          ? `${accentBg[accent]} border-transparent shadow-lg`
          : 'bg-slate-800 border-slate-700'
      }`}
      role="switch"
      aria-checked={enabled}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-300 flex items-center justify-center ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      </span>
    </button>
  );
};

// Single toggle row inside the Bot Configuration panel
const ConfigToggleRow: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  accent?: 'cyan' | 'emerald' | 'amber' | 'purple' | 'rose';
  badge?: string;
  danger?: boolean;
}> = ({ icon, title, description, enabled, onToggle, accent = 'cyan', badge, danger }) => {
  return (
    <div className={`flex items-start justify-between gap-4 p-4 rounded-2xl border transition-all ${
      enabled
        ? danger
          ? 'bg-amber-950/20 border-amber-500/30'
          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
        : 'bg-slate-950/50 border-slate-800/60 opacity-80 hover:opacity-100'
    }`}>
      <div className="flex items-start gap-3.5 flex-1">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${
          enabled ? 'bg-slate-900 border-slate-700 text-cyan-400' : 'bg-slate-900/60 border-slate-800 text-slate-500'
        }`}>
          {icon}
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-bold text-white tracking-tight">{title}</h4>
            {badge && (
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider border ${
                enabled
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                  : 'bg-slate-800 text-slate-500 border-slate-700'
              }`}>
                {badge}
              </span>
            )}
            <span className={`text-[10px] font-mono font-bold ${enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
              {enabled ? '● ON' : '○ OFF'}
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="pt-1">
        <ToggleSwitch enabled={enabled} onToggle={onToggle} accent={accent} />
      </div>
    </div>
  );
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  botConfig,
  onUpdateBotConfig,
  onNavigateToSecurity
}) => {
  return (
    <div className="space-y-8 animate-in fade-in duration-300 text-left">
      {/* View Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-700 flex items-center justify-center text-white font-bold shadow-lg shadow-purple-500/20">
            <Settings2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Bot Settings</h2>
            <p className="text-xs text-slate-400">Master execution switches, trailing rules, QUAD auto-trading &amp; testnet sandbox controls</p>
          </div>
        </div>

        <button
          onClick={onNavigateToSecurity}
          className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-emerald-300 font-semibold text-xs flex items-center gap-2 border border-slate-700 transition-colors group"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Binance API &amp; Security Page</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
        </button>
      </div>

      {/* ===== Bot Configuration Toggle Panel ===== */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-bold text-white">Bot Configuration &amp; Execution Switches</h3>
          </div>
          <div className="flex items-center gap-2">
            {botConfig.binanceTestnetMode && (
              <span className="px-2.5 py-1 rounded-full bg-amber-950 text-amber-400 text-[10px] font-mono font-bold border border-amber-800 flex items-center gap-1.5 animate-pulse">
                <FlaskConical className="w-3 h-3" /> TESTNET ACTIVE
              </span>
            )}
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border flex items-center gap-1.5 ${
              botConfig.masterBotEnabled
                ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                : 'bg-rose-950 text-rose-400 border-rose-800'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${botConfig.masterBotEnabled ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`} />
              {botConfig.masterBotEnabled ? 'BOT LIVE' : 'BOT DISABLED'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Master Bot Switch */}
          <ConfigToggleRow
            icon={<Power className="w-4.5 h-4.5" />}
            title="Master Bot Switch"
            description="Enable or disable automated trading execution. When OFF, all incoming alerts are logged but no Binance orders are placed."
            enabled={botConfig.masterBotEnabled}
            onToggle={() => onUpdateBotConfig({ ...botConfig, masterBotEnabled: !botConfig.masterBotEnabled })}
            accent="emerald"
            badge="GLOBAL"
          />

          {/* Auto-Breakeven at TP1 */}
          <ConfigToggleRow
            icon={<Crosshair className="w-4.5 h-4.5" />}
            title="Auto-Breakeven at TP1"
            description="Move Stop Loss to Entry Price when Take Profit 1 is hit. Locks in a risk-free position automatically."
            enabled={botConfig.autoBreakevenAtTp1}
            onToggle={() => onUpdateBotConfig({ ...botConfig, autoBreakevenAtTp1: !botConfig.autoBreakevenAtTp1 })}
            accent="cyan"
            badge="TRAILING"
          />

          {/* Trail SL to TP1 at TP2 */}
          <ConfigToggleRow
            icon={<TrendingUp className="w-4.5 h-4.5" />}
            title="Trail SL to TP1 at TP2"
            description="Move Stop Loss to TP1 price when Take Profit 2 is hit. Guarantees TP1-level profit on the remaining position."
            enabled={botConfig.trailSlToTp1AtTp2}
            onToggle={() => onUpdateBotConfig({ ...botConfig, trailSlToTp1AtTp2: !botConfig.trailSlToTp1AtTp2 })}
            accent="cyan"
            badge="TRAILING"
          />

          {/* Auto Trade (QUAD Signals) */}
          <ConfigToggleRow
            icon={<Bot className="w-4.5 h-4.5" />}
            title="Auto Trade (QUAD Signals)"
            description="Automatically open a trade when SATS & Lorentzian agree on a Combo BUY signal. Only one trade per symbol. Max open trades controlled below."
            enabled={botConfig.autoTradeQuadSignals}
            onToggle={() => onUpdateBotConfig({ ...botConfig, autoTradeQuadSignals: !botConfig.autoTradeQuadSignals })}
            accent="purple"
            badge="QUAD"
          />

          {/* Manual Trade API */}
          <ConfigToggleRow
            icon={<Code2 className="w-4.5 h-4.5" />}
            title="Manual Trade API"
            description="Allow manual trades via the /api/manual-trade endpoint. External tools/scripts can POST Entry, SL, TP. Needs the Node.js API server running."
            enabled={botConfig.manualTradeApiEnabled}
            onToggle={() => onUpdateBotConfig({ ...botConfig, manualTradeApiEnabled: !botConfig.manualTradeApiEnabled })}
            accent="amber"
            badge="FUTURE"
          />

          {/* Binance Testnet Mode */}
          <ConfigToggleRow
            icon={<FlaskConical className="w-4.5 h-4.5" />}
            title="Binance Testnet Mode"
            description="When enabled, all trades will be executed on Binance Spot Testnet. Use Testnet API keys."
            enabled={botConfig.binanceTestnetMode}
            onToggle={() => onUpdateBotConfig({ ...botConfig, binanceTestnetMode: !botConfig.binanceTestnetMode })}
            accent="amber"
            badge="SANDBOX"
            danger
          />
        </div>

        {/* Testnet API Key Setup Hint — shown only when Testnet Mode is ON */}
        {botConfig.binanceTestnetMode && (
          <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-3">
              <FlaskConical className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-amber-200">Testnet API Keys প্রয়োজন!</h4>
                <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
                  Testnet Mode চালু আছে — এখন <strong>Binance API &amp; Security</strong> পেজের <strong>🧪 Testnet (Sandbox)</strong> ট্যাবে Testnet API Key দিন। ফ্রি sandbox key পাবেন: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-300 font-mono">testnet.binance.vision</code> (GitHub দিয়ে লগইন, কোনো আসল টাকা লাগে না)।
                </p>
              </div>
            </div>
            <button
              onClick={onNavigateToSecurity}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all shrink-0"
            >
              <span>Testnet Keys দিন</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Max Open Trades Limit Control */}
        <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-purple-400 shrink-0">
              <Layers className="w-4.5 h-4.5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white tracking-tight">Max Open Trades (QUAD Auto-Trading)</h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Maximum number of simultaneous open positions the QUAD auto-trader may hold. New Combo BUY signals are ignored once the limit is reached.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => onUpdateBotConfig({ ...botConfig, maxOpenTrades: Math.max(1, botConfig.maxOpenTrades - 1) })}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg transition-colors"
            >
              −
            </button>
            <div className="w-14 text-center">
              <span className="text-xl font-bold font-mono text-purple-300">{botConfig.maxOpenTrades}</span>
              <div className="text-[9px] text-slate-500 font-mono uppercase">Trades</div>
            </div>
            <button
              type="button"
              onClick={() => onUpdateBotConfig({ ...botConfig, maxOpenTrades: Math.min(20, botConfig.maxOpenTrades + 1) })}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg transition-colors"
            >
              +
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono border-t border-slate-800/80 pt-3">
          <span>Settings auto-persist to botSettings singleton row instantly</span>
          <span className="text-cyan-400">No restart required — Monitor picks up changes next 30s loop</span>
        </div>
      </div>

      {/* Quick link card to API & Security page */}
      <div className="bg-gradient-to-br from-emerald-950/30 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-3xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-slate-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white tracking-tight">Looking for Binance API Keys, Webhook Secret or Gmail IMAP?</h4>
            <p className="text-xs text-slate-400 mt-0.5">All credentials &amp; encryption settings now live on their own dedicated page.</p>
          </div>
        </div>
        <button
          onClick={onNavigateToSecurity}
          className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all group"
        >
          <span>Open Binance API &amp; Security</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </div>
  );
};
