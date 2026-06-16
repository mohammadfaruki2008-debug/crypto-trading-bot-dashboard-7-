import { useState, useEffect, useCallback } from 'react';
import { 
  BotStatus, 
  TradePosition,
  AlertLog,
  TradeableCoin,
  BotConfig,
  BinanceSettings,
  AlertSettings
} from './types';
import { loadAppState, saveAppState } from './mockData';
import { useLiveBinancePrices } from './hooks/useLiveBinancePrices';
import { ToastContainer, ToastMessage } from './components/Toast';
import { Navbar } from './components/Navbar';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { LoginModal } from './components/LoginModal';
import { BinanceServerIpModal, TradingViewWebhookSimulatorModal } from './components/Modals';

// Interactive sub-views
import { DashboardOverviewView } from './components/DashboardOverviewView';
import { CoinsView } from './components/CoinsView';
import { PositionsView } from './components/PositionsView';
import { AlertLogsView } from './components/AlertLogsView';
import { MonitorConsoleView } from './components/MonitorConsoleView';
import { SettingsView } from './components/SettingsView';
import { ApiSecurityView } from './components/ApiSecurityView';
import { TradingViewChartView } from './components/TradingViewChartView';
import { TradeJarvisFloating } from './components/TradeJarvisFloating';

export function App() {
  // 1. Initial State Initialization
  const [appState, setAppState] = useState<any>(() => loadAppState());
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  
  // Modals state
  const [showIpModal, setShowIpModal] = useState<boolean>(false);
  const [showWebhookModal, setShowWebhookModal] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Deconstruct state
  const {
    botStatus,
    user,
    binanceSettings,
    alertSettings,
    coins,
    positions,
    alertLogs,
    monitorLogs,
    portfolioUsdtBalance,
    botConfig,
  } = appState;

  // Persist edits whenever appState changes
  useEffect(() => {
    saveAppState(appState);
  }, [appState]);

  // Toast Notification helper
  const addToast = useCallback((type: 'success' | 'error' | 'info', title: string, message: string) => {
    const id = Date.now().toString() + Math.random().toString().slice(2, 6);
    setToasts((prev: ToastMessage[]) => [...prev, { id, type, title, message }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev: ToastMessage[]) => prev.filter((t: ToastMessage) => t.id !== id));
  }, []);

  // Live WebSocket Tickers (Public Feed)
  const { tickers, isConnected } = useLiveBinancePrices(coins);

  // 24/7 Monitor is now handled entirely on the backend server.
  // The frontend just displays whatever the backend tells it.

  // Handlers for App Navigation & Operational Overrides
  const toggleBotRunState = () => {
    const nextStatus: BotStatus = botStatus === 'running' ? 'paused' : 'running';
    setAppState((prev: any) => ({ ...prev, botStatus: nextStatus }));
    addToast(
      nextStatus === 'running' ? 'success' : 'info',
      nextStatus === 'running' ? '🚀 Binance Automata Started' : '⏸️ System Halted',
      nextStatus === 'running' ? 'Background engine polling Active trades every 30s.' : 'Spot buy order execution disabled.'
    );
  };

  const handleAdminLogin = (email: string) => {
    setAppState((prev: any) => ({
      ...prev,
      user: { email, isLoggedIn: true, lastLogin: new Date().toISOString() }
    }));
    addToast('success', 'Admin Session Authenticated', `Logged in as operator ${email}`);
  };

  const handleAdminLogout = () => {
    setAppState((prev: any) => ({
      ...prev,
      user: { ...prev.user, isLoggedIn: false }
    }));
  };

  // Webhook Execution Simulator Handler
  const handleIncomingTradingViewAlert = async (incomingPayload: any) => {
    const timestamp = new Date().toISOString();
    const id = 'alert_' + Date.now() + Math.random().toString().slice(2, 6);

    // 0. Master Bot Switch gate — block all automated execution when disabled
    if (!botConfig?.masterBotEnabled) {
      const blockedLog: AlertLog = {
        id,
        timestamp,
        source: incomingPayload?.source || 'TradingView Webhook',
        ticker: incomingPayload?.ticker || 'UNKNOWN',
        action: incomingPayload?.action || 'buy',
        status: 'Rejected',
        message: 'Rejected: Master Bot Switch is OFF in Settings. Alert received and logged, but no Binance order was executed.',
        payload: incomingPayload
      };
      setAppState((prev: any) => ({
        ...prev,
        alertLogs: [blockedLog, ...prev.alertLogs].slice(0, 300),
        monitorLogs: [{
          id: 'mon_' + Date.now(),
          timestamp,
          level: 'warn',
          category: 'Trading Engine',
          message: `Incoming alert blocked — Master Bot Switch disabled. No spot order placed for ${incomingPayload?.ticker || 'UNKNOWN'}.`
        }, ...prev.monitorLogs].slice(0, 200)
      }));
      addToast('error', '🔌 Master Bot Switch OFF', 'Alert logged but execution blocked. Enable the bot in Settings → Bot Configuration.');
      return;
    }

    // 0.5 Signal Source gates — TradingView Webhook / Gmail IMAP on-off switches
    const isImapSource = incomingPayload?.source === 'Gmail IMAP';
    const isSimSurge = incomingPayload?.source === 'Simulated Market Breakout Surge';
    const isQuadSource = typeof incomingPayload?.source === 'string' && (incomingPayload.source.startsWith('QUAD') || incomingPayload.source === 'Quantum Mind');

    if (isImapSource && !alertSettings.imapEnabled) {
      const imapOffLog: AlertLog = {
        id,
        timestamp,
        source: 'Gmail IMAP',
        ticker: incomingPayload?.ticker || 'UNKNOWN',
        action: incomingPayload?.action || 'buy',
        status: 'Rejected',
        message: 'Rejected: Gmail IMAP Signal Scraper is switched OFF in Binance API & Security settings. Email alert ignored.',
        payload: incomingPayload
      };
      setAppState((prev: any) => ({
        ...prev,
        alertLogs: [imapOffLog, ...prev.alertLogs].slice(0, 300),
        monitorLogs: [{
          id: 'mon_' + Date.now(),
          timestamp,
          level: 'warn',
          category: 'Monitor',
          message: `Gmail IMAP alert ignored — IMAP toggle is OFF. No spot order placed for ${incomingPayload?.ticker || 'UNKNOWN'}.`
        }, ...prev.monitorLogs].slice(0, 200)
      }));
      addToast('error', '📧 Gmail IMAP Switched OFF', 'Email signal ignored. Enable IMAP in Binance API & Security page.');
      return;
    }

    if (!isImapSource && !isSimSurge && !isQuadSource && alertSettings.webhookEnabled === false) {
      const whOffLog: AlertLog = {
        id,
        timestamp,
        source: 'TradingView Webhook',
        ticker: incomingPayload?.ticker || 'UNKNOWN',
        action: incomingPayload?.action || 'buy',
        status: 'Rejected',
        message: 'Rejected: TradingView Webhook receiver is switched OFF in Binance API & Security settings. JSON alert dropped.',
        payload: incomingPayload
      };
      setAppState((prev: any) => ({
        ...prev,
        alertLogs: [whOffLog, ...prev.alertLogs].slice(0, 300),
        monitorLogs: [{
          id: 'mon_' + Date.now(),
          timestamp,
          level: 'warn',
          category: 'Monitor',
          message: `TradingView webhook alert dropped — Webhook toggle is OFF. No spot order placed for ${incomingPayload?.ticker || 'UNKNOWN'}.`
        }, ...prev.monitorLogs].slice(0, 200)
      }));
      addToast('error', '⚡ Webhook Receiver Switched OFF', 'JSON alert dropped. Enable Webhook in Binance API & Security page.');
      return;
    }

    // 1. Verify Authentication Secret
    if (incomingPayload?.secret !== alertSettings.webhookSecret) {
      const dropLog: AlertLog = {
        id,
        timestamp,
        source: incomingPayload?.source || 'TradingView Webhook',
        ticker: incomingPayload?.ticker || 'UNKNOWN',
        action: incomingPayload?.action || 'buy',
        status: 'Invalid Secret',
        message: `WEBHOOK_SECRET authentication mismatch! Token provided ("${incomingPayload?.secret}") is forbidden. Alert dropped.`,
        payload: incomingPayload
      };
      setAppState((prev: any) => ({
        ...prev,
        alertLogs: [dropLog, ...prev.alertLogs].slice(0, 300),
        monitorLogs: [{
          id: 'mon_' + Date.now(),
          timestamp,
          level: 'error',
          category: 'Security',
          message: `Attempted incoming webhook call with incorrect secret token. Host IP logged and blocked.`
        }, ...prev.monitorLogs].slice(0, 200)
      }));
      addToast('error', '⚠️ Security Alert Dropped', 'Webhook failed secret verification.');
      return;
    }

    // 2. Verify Active Tradeable Coin
    const targetTicker = (incomingPayload?.ticker || 'BTCUSDT').toUpperCase();
    const approvedCoin = coins.find((c: TradeableCoin) => c.ticker === targetTicker && c.isActive);

    if (!approvedCoin) {
      const rejLog: AlertLog = {
        id,
        timestamp,
        source: incomingPayload?.source || 'TradingView Webhook',
        ticker: targetTicker,
        action: incomingPayload?.action || 'buy',
        status: 'Rejected',
        message: `Rejected: Ticker ${targetTicker} is disabled or absent in your Tradeable Coins active whitelist. Execution cancelled.`,
        payload: incomingPayload
      };
      setAppState((prev: any) => ({
        ...prev,
        alertLogs: [rejLog, ...prev.alertLogs].slice(0, 300)
      }));
      addToast('error', `🔴 Ticker ${targetTicker} Not Tradeable`, 'Configure and activate coin pair in Tradeable Coins settings.');
      return;
    }

    // 2.5 Risk Limits: Max open trades & one trade per symbol
    const openTrades = positions.filter((p: TradePosition) => p.status === 'open');

    if (openTrades.length >= (botConfig?.maxOpenTrades ?? 5)) {
      const limitLog: AlertLog = {
        id,
        timestamp,
        source: incomingPayload?.source || 'TradingView Webhook',
        ticker: targetTicker,
        action: 'buy',
        status: 'Rejected',
        message: `Rejected: Max Open Trades limit (${botConfig?.maxOpenTrades}) reached. Close an existing position or raise the limit in Settings.`,
        payload: incomingPayload
      };
      setAppState((prev: any) => ({
        ...prev,
        alertLogs: [limitLog, ...prev.alertLogs].slice(0, 300)
      }));
      addToast('error', '🚧 Max Open Trades Reached', `Limit of ${botConfig?.maxOpenTrades} simultaneous positions hit. Signal skipped.`);
      return;
    }

    const alreadyOpenOnSymbol = openTrades.some((p: TradePosition) => p.ticker === targetTicker);
    if (alreadyOpenOnSymbol && !isSimSurge) {
      const dupLog: AlertLog = {
        id,
        timestamp,
        source: incomingPayload?.source || 'TradingView Webhook',
        ticker: targetTicker,
        action: 'buy',
        status: 'Rejected',
        message: `Rejected: One trade per symbol rule. ${targetTicker} already has an open position — duplicate entry skipped.`,
        payload: incomingPayload
      };
      setAppState((prev: any) => ({
        ...prev,
        alertLogs: [dupLog, ...prev.alertLogs].slice(0, 300)
      }));
      addToast('info', `♻️ ${targetTicker} Duplicate Signal Skipped`, 'Only one open trade per symbol is allowed.');
      return;
    }

    // ─── Frontend UI Notification Only ──────────────────────────────
    // Actual trade execution is handled securely by the backend server.
    const uiLog: AlertLog = {
      id,
      timestamp,
      source: incomingPayload?.source || 'Manual',
      ticker: targetTicker,
      action: 'buy',
      status: 'Success',
      message: `Signal received for ${targetTicker}. Executing on backend...`,
      payload: incomingPayload
    };

    setAppState((prev: any) => ({
      ...prev,
      alertLogs: [uiLog, ...prev.alertLogs].slice(0, 300)
    }));

    addToast('success', `🚀 Signal Dispatched: ${targetTicker}`, `Executing real trade on backend server...`);
  };

  // Trade Execution Floor Manual Controls
  const forceMarketClosePosition = (posId: string, closePrice: number) => {
    setAppState((prev: any) => {
      const position = prev.positions.find((p: TradePosition) => p.id === posId);
      if (!position) return prev;

      const realizedNet = ((closePrice - position.buyPrice) / position.buyPrice) * position.amount;
      const newPositions = prev.positions.map((p: TradePosition) => {
        if (p.id !== posId) return p;
        return {
          ...p,
          currentPrice: closePrice,
          status: 'closed_manual' as const,
          pnlUsdt: realizedNet,
          pnlPct: ((closePrice - position.buyPrice) / position.buyPrice) * 100,
          closedAt: new Date().toISOString()
        };
      });

      addToast(
        realizedNet >= 0 ? 'success' : 'info',
        `🛑 Manual Exit: ${position.ticker}`,
        `Closed position at ${closePrice} USDT. Net realized PnL: ${realizedNet >= 0 ? '+' : ''}${realizedNet.toFixed(2)} USDT.`
      );

      return {
        ...prev,
        portfolioUsdtBalance: prev.portfolioUsdtBalance + position.amount + realizedNet,
        positions: newPositions,
        monitorLogs: [{
          id: 'mon_' + Date.now(),
          timestamp: new Date().toISOString(),
          level: 'info',
          category: 'Trading Engine',
          message: `[${position.ticker}] Emergency manual market closure triggered by Operator. Realized return: ${realizedNet.toFixed(2)} USDT.`
        }, ...prev.monitorLogs].slice(0, 200)
      };
    });
  };

  const forceMoveSlToBreakeven = (posId: string) => {
    setAppState((prev: any) => {
      return {
        ...prev,
        positions: prev.positions.map((p: TradePosition) => {
          if (p.id !== posId) return p;
          addToast('success', `🔒 Locked Breakeven: ${p.ticker}`, `Stop loss raised from ${p.currentSl} to Entry price ${p.buyPrice} USDT.`);
          return {
            ...p,
            currentSl: p.buyPrice,
            slMovedToBreakeven: true
          };
        }),
        monitorLogs: [{
          id: 'mon_' + Date.now(),
          timestamp: new Date().toISOString(),
          level: 'success',
          category: 'Trading Engine',
          message: `[${prev.positions.find((x: TradePosition) => x.id === posId)?.ticker}] Trailing SL manually overridden to Breakeven by Operator.`
        }, ...prev.monitorLogs].slice(0, 200)
      };
    });
  };

  const triggerSimulatedTpBreakout = (posId: string) => {
    const pos = positions.find((p: TradePosition) => p.id === posId);
    if (!pos) return;

    let targetSurgePrice = pos.tp1;
    if (pos.tp1Status === 'filled') targetSurgePrice = pos.tp2;
    if (pos.tp2Status === 'filled') targetSurgePrice = pos.tp3;

    // Simulate webhook market surge
    handleIncomingTradingViewAlert({
      action: 'buy',
      ticker: pos.ticker,
      price: targetSurgePrice + (targetSurgePrice * 0.002), // slightly above TP
      secret: alertSettings.webhookSecret,
      source: 'Simulated Market Breakout Surge'
    });
    // Run sync loop
    // Monitor sync is handled by backend
  };

  // Handlers for Coins
  const handleAddNewCoin = (newCoinData: Omit<TradeableCoin, 'id' | 'createdAt'>) => {
    const id = 'coin_' + Date.now();
    const fullCoin: TradeableCoin = {
      ...newCoinData,
      id,
      createdAt: new Date().toISOString()
    };
    setAppState((prev: any) => ({
      ...prev,
      coins: [...prev.coins, fullCoin]
    }));
    addToast('success', `🪙 Added Tradeable Coin ${fullCoin.ticker}`, `Allocation rule set to ${fullCoin.allocationValue}${fullCoin.allocationType === 'percentage' ? '%' : ' USDT'}.`);
  };

  const handleToggleCoinActive = (coinId: string) => {
    setAppState((prev: any) => ({
      ...prev,
      coins: prev.coins.map((c: TradeableCoin) => c.id === coinId ? { ...c, isActive: !c.isActive } : c)
    }));
  };

  // Alert Settings save handler with toggle-change toast feedback
  const handleSaveAlertSettings = (updated: AlertSettings) => {
    const old: AlertSettings = alertSettings;
    setAppState((prev: any) => ({ ...prev, alertSettings: updated }));

    const logSourceToggle = (label: string, enabled: boolean, emoji: string) => {
      addToast(
        enabled ? 'success' : 'info',
        `${emoji} ${label} ${enabled ? 'Enabled' : 'Disabled'}`,
        `${label} signal source is now ${enabled ? 'ACTIVE — incoming signals will execute trades.' : 'OFF — incoming signals will be rejected and logged.'}`
      );
      setAppState((prev: any) => ({
        ...prev,
        alertSettings: updated,
        monitorLogs: [{
          id: 'mon_' + Date.now() + Math.random().toString().slice(2, 5),
          timestamp: new Date().toISOString(),
          level: enabled ? 'success' : 'warn',
          category: 'Monitor',
          message: `Operator toggled signal source: "${label}" → ${enabled ? 'ENABLED ✅' : 'DISABLED ⛔'}. Persisted to botSettings.`
        }, ...prev.monitorLogs].slice(0, 200)
      }));
    };

    if ((old.webhookEnabled !== false) !== (updated.webhookEnabled !== false)) {
      logSourceToggle('TradingView Webhook', updated.webhookEnabled !== false, '⚡');
    } else if (old.imapEnabled !== updated.imapEnabled) {
      logSourceToggle('Gmail IMAP Scraper', updated.imapEnabled, '📧');
    }
  };

  // Bot Configuration toggle updater with live toast feedback
  const handleUpdateBotConfig = (updated: BotConfig) => {
    const old: BotConfig = botConfig;
    setAppState((prev: any) => ({ ...prev, botConfig: updated }));

    // Identify which switch changed for toast + monitor log feedback
    const changes: { key: keyof BotConfig; label: string }[] = [
      { key: 'masterBotEnabled', label: 'Master Bot Switch' },
      { key: 'autoBreakevenAtTp1', label: 'Auto-Breakeven at TP1' },
      { key: 'trailSlToTp1AtTp2', label: 'Trail SL to TP1 at TP2' },
      { key: 'autoTradeQuadSignals', label: 'Auto Trade (QUAD Signals)' },
      { key: 'manualTradeApiEnabled', label: 'Manual Trade API' },
      { key: 'binanceTestnetMode', label: 'Binance Testnet Mode' },
      { key: 'maxOpenTrades', label: 'Max Open Trades' },
    ];

    for (const change of changes) {
      if (old?.[change.key] !== updated[change.key]) {
        const newVal = updated[change.key];
        const isBool = typeof newVal === 'boolean';
        const valueLabel = isBool ? (newVal ? 'ENABLED ✅' : 'DISABLED ⛔') : `set to ${newVal}`;

        addToast(
          isBool ? (newVal ? 'success' : 'info') : 'info',
          `⚙️ ${change.label} ${isBool ? (newVal ? 'Enabled' : 'Disabled') : 'Updated'}`,
          `${change.label} is now ${valueLabel}. Saved to botSettings instantly.`
        );

        setAppState((prev: any) => ({
          ...prev,
          botConfig: updated,
          monitorLogs: [{
            id: 'mon_' + Date.now() + Math.random().toString().slice(2, 5),
            timestamp: new Date().toISOString(),
            level: 'info',
            category: 'Monitor',
            message: `Operator changed bot setting: "${change.label}" → ${valueLabel}. Configuration persisted to botSettings singleton row.`
          }, ...prev.monitorLogs].slice(0, 200)
        }));
        break;
      }
    }
  };

  const handleDeleteCoin = (coinId: string) => {
    setAppState((prev: any) => ({
      ...prev,
      coins: prev.coins.filter((c: TradeableCoin) => c.id !== coinId)
    }));
    addToast('info', 'Tradeable Coin Purged', 'Pair configuration removed from local database.');
  };

  // If not logged in, render only our beautiful Single-Admin Login Screen
  if (!user.isLoggedIn) {
    return <LoginModal onLoginSuccess={handleAdminLogin} />;
  }

  // Active counters
  const openPosCount = positions.filter((p: TradePosition) => p.status === 'open').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Toast Popups */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Main App Navbar */}
      <Navbar 
        botStatus={botStatus}
        onToggleBotStatus={toggleBotRunState}
        onOpenWebhookModal={() => setShowWebhookModal(true)}
        onOpenIpModal={() => setShowIpModal(true)}
        adminEmail={user.email}
        onLogout={handleAdminLogout}
        connectionMode={isConnected ? 'Live' : 'Disconnected'}
        isConnected={isConnected}
        testnetMode={botConfig?.binanceTestnetMode}
      />

      {/* Main Dashboard Workbench Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Interactive Sidebar */}
        <Sidebar 
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          activePositionsCount={openPosCount}
          alertLogsCount={alertLogs.length}
          coinsCount={coins.length}
        />

        {/* Center Main Tab View Hub */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
          {activeTab === 'overview' && (
            <DashboardOverviewView 
              portfolioUsdtBalance={portfolioUsdtBalance}
              positions={positions}
              tickers={tickers}
              onNavigateTab={setActiveTab}
              onOpenWebhookModal={() => setShowWebhookModal(true)}
            />
          )}

          {activeTab === 'coins' && (
            <CoinsView 
              coins={coins}
              onAddCoin={handleAddNewCoin}
              onToggleCoinActive={handleToggleCoinActive}
              onDeleteCoin={handleDeleteCoin}
            />
          )}

          {activeTab === 'tvchart' && (
            <TradingViewChartView 
              coins={coins}
              positions={positions}
              botConfig={botConfig}
              tickers={tickers}
              webhookSecret={alertSettings.webhookSecret}
              onExecuteQuadTrade={handleIncomingTradingViewAlert}
              onNavigateToSettings={() => setActiveTab('settings')}
            />
          )}

          {activeTab === 'positions' && (
            <PositionsView 
              positions={positions}
              tickers={tickers}
              onClosePosition={forceMarketClosePosition}
              onForceMoveSlToBreakeven={forceMoveSlToBreakeven}
              onSimulateTpBreakout={triggerSimulatedTpBreakout}
              onOpenWebhookModal={() => setShowWebhookModal(true)}
            />
          )}

          {activeTab === 'alerts' && (
            <AlertLogsView 
              alertLogs={alertLogs}
              onClearLogs={() => setAppState((prev: any) => ({ ...prev, alertLogs: [] }))}
              onOpenWebhookModal={() => setShowWebhookModal(true)}
            />
          )}

          {activeTab === 'monitor' && (
            <MonitorConsoleView 
              monitorLogs={monitorLogs}
              onTriggerMonitorLoop={() => addToast('info', 'Monitor', 'The 24/7 monitor runs on the backend.')}
              onClearLogs={() => setAppState((prev: any) => ({ ...prev, monitorLogs: [] }))}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView 
              botConfig={botConfig}
              onUpdateBotConfig={handleUpdateBotConfig}
              onNavigateToSecurity={() => setActiveTab('security')}
            />
          )}

          {activeTab === 'security' && (
            <ApiSecurityView 
              binanceSettings={binanceSettings}
              alertSettings={alertSettings}
              testnetMode={botConfig?.binanceTestnetMode}
              onSaveBinanceSettings={(updated: BinanceSettings) => setAppState((prev: any) => ({ ...prev, binanceSettings: updated }))}
              onSaveAlertSettings={handleSaveAlertSettings}
              onOpenIpModal={() => setShowIpModal(true)}
            />
          )}
        </main>
      </div>

      {/* Modals Suite */}
      {showIpModal && (
        <BinanceServerIpModal 
          serverIp={binanceSettings.serverIp}
          onClose={() => setShowIpModal(false)}
        />
      )}

      {showWebhookModal && (
        <TradingViewWebhookSimulatorModal 
          coins={coins}
          webhookSecret={alertSettings.webhookSecret}
          onClose={() => setShowWebhookModal(false)}
          onSimulateWebhook={handleIncomingTradingViewAlert}
        />
      )}

      {/* JARVIS — autonomous AI agent floating widget */}
      <TradeJarvisFloating />
    </div>
  );
}

export default App;
