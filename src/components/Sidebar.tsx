import React from 'react';
import { 
  LayoutDashboard, 
  Coins, 
  TrendingUp, 
  Activity, 
  Terminal, 
  Settings2,
  ShieldCheck,
  CandlestickChart,
  Flame
} from 'lucide-react';

export type ActiveTab = 'overview' | 'coins' | 'positions' | 'alerts' | 'monitor' | 'settings' | 'security' | 'tvchart';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  activePositionsCount: number;
  alertLogsCount: number;
  coinsCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  activePositionsCount,
  alertLogsCount,
  coinsCount
}) => {
  const navItems: { id: ActiveTab; label: string; icon: React.FC<{ className?: string }>; badge?: number | string; highlight?: boolean }[] = [
    {
      id: 'overview',
      label: 'Dashboard Overview',
      icon: LayoutDashboard,
    },
    {
      id: 'coins',
      label: 'Tradeable Coins',
      icon: Coins,
      badge: coinsCount,
    },
    {
      id: 'positions',
      label: 'Active Positions',
      icon: TrendingUp,
      badge: activePositionsCount > 0 ? activePositionsCount : undefined,
      highlight: activePositionsCount > 0,
    },
    {
      id: 'tvchart',
      label: 'Quantum Mind',
      icon: CandlestickChart,
      badge: 'AI',
    },
    {
      id: 'alerts',
      label: 'Webhook & Signal Logs',
      icon: Activity,
      badge: alertLogsCount > 99 ? '99+' : alertLogsCount,
    },
    {
      id: 'monitor',
      label: 'Monitor Terminal',
      icon: Terminal,
    },
    {
      id: 'settings',
      label: 'Bot Settings',
      icon: Settings2,
    },
    {
      id: 'security',
      label: 'Binance API & Security',
      icon: ShieldCheck,
    },
  ];

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col justify-between p-4 shrink-0 hidden lg:flex min-h-[calc(100vh-69px)]">
      <div className="space-y-6">
        {/* Navigation Category */}
        <div>
          <div className="px-3 mb-2 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            Bot Operator Hub
          </div>
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all group ${
                    isActive 
                      ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/20' 
                      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                      isActive ? 'text-white' : item.highlight ? 'text-amber-400' : 'text-slate-400 group-hover:text-cyan-400'
                    }`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                      isActive 
                        ? 'bg-cyan-800 text-cyan-100' 
                        : item.highlight
                        ? 'bg-amber-500 text-slate-950 animate-pulse'
                        : 'bg-slate-800 text-slate-300'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* System Architecture Quick Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 text-left space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
            <Flame className="w-4 h-4 fill-current animate-pulse" /> Spot Execution Flow
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Alerts hit <code className="text-cyan-300 bg-slate-800 px-1 py-0.5 rounded">/api/webhook</code>. Automated Spot Buys split into <span className="text-emerald-400 font-semibold">TP1 (3%)</span>, <span className="text-emerald-400 font-semibold">TP2 (6%)</span>, and <span className="text-emerald-400 font-semibold">TP3 (10%)</span>.
          </p>
          <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500 font-mono border-t border-slate-800/80">
            <span>Interval</span>
            <span className="text-cyan-400">Every 30s Check</span>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="border-t border-slate-900 pt-4 text-xs text-slate-500 font-mono text-center">
        Quantum Mind v1.0 <br /> 8-Engine AI Trading System
      </div>
    </aside>
  );
};
