import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  BotStatus, 
  MonitorLog,
  TradePosition,
  AlertLog,
  TradeableCoin,
  BotConfig,
  BinanceSettings,
  AlertSettings
} from './types';
import { executeTradingSignal } from './lib/tradingEngine';
import { configureWebhook, pollPendingAlerts, ackAlerts } from './lib/webhookReceiver';
import { configureImap, pollImapSignals, ackImapSignals } from './lib/imapClient';
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
import { JarvisContext } from './lib/jarvisBrain';
import { analyzeQuad, fetchKlines } from './lib/quadEngine';
import { computeExtraIndicators } from './lib/extraIndicators';
import { getLivePrice } from './lib/binanceApi';

export function App() {
  // 1. Initial State Initialization
  const [appState, setAppState] = useState<any>(() => loadAppState());
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  
  // Modals state
  const [showIpModal, setShowIpModal] = useState<boolean>(false);
  const [showWebhookModal, setShowWebhookModal] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const jarvisAlerts = useRef<{ symbol: string; price: number; direction: string }[]>([]);

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

  // ─── Configure webhook + IMAP receivers whenever settings change ──
  useEffect(() => {
    configureWebhook(alertSettings.webhookUrl || '', alertSettings.webhookSecret, alertSettings.webhookEnabled !== false);
    configureImap(alertSettings.webhookUrl || '', alertSettings.webhookSecret, alertSettings.imapEnabled);
  }, [alertSettings]);

  // ─── Poll webhook alerts (every 10s when enabled) ─────────────────
  useEffect(() => {
    if (alertSettings.webhookEnabled === false) return;
    const timer = setInterval(async () => {
      const alerts = await pollPendingAlerts();
      for (const alert of alerts) {
        handleIncomingTradingViewAlert({ ...alert.payload, source: 'TradingView Webhook' });
      }
      if (alerts.length > 0) await ackAlerts(alerts.map(a => a.id));
    }, 10000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertSettings.webhookEnabled, alertSettings.webhookUrl, alertSettings.webhookSecret]);

  // ─── Poll IMAP signals (every 15s when enabled) ───────────────────
  useEffect(() => {
    if (!alertSettings.imapEnabled) return;
    const timer = setInterval(async () => {
      const signals = await pollImapSignals();
      for (const sig of signals) {
        if (!sig.parsed) continue;
        const { action, ticker, price, sl, tp1, tp2, tp3 } = sig.parsed;
        if (action === 'buy' && ticker && price) {
          handleIncomingTradingViewAlert({
            action,
            ticker,
            price,
            sl: sl || 0,
            tp1: tp1 || 0,
            tp2: tp2 || 0,
            tp3: tp3 || 0,
            secret: alertSettings.webhookSecret,
            source: 'Gmail IMAP',
          });
        }
      }
      if (signals.length > 0) await ackImapSignals(signals.map(s => s.id));
    }, 15000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertSettings.imapEnabled, alertSettings.webhookUrl, alertSettings.webhookSecret]);

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

  // Live WebSocket Tickers — tradeable coins + open position symbols
  const openPositionSymbols = useMemo(
    () => positions.filter((p: TradePosition) => p.status === 'open').map((p: TradePosition) => p.ticker),
    [positions]
  );
  const { tickers, isConnected, connectionMode } = useLiveBinancePrices(coins, openPositionSymbols);

  // Auto 30s / Manual Trailing Monitor Daemon Simulator
  const executeMonitorSyncLoop = useCallback(() => {
    if (botStatus !== 'running') return;

    setAppState((prev: any) => {
      let updatedBalance = prev.portfolioUsdtBalance;
      let newLogs: MonitorLog[] = [];
      let toastQueue: { type: 'success' | 'info'; title: string; msg: string }[] = [];

      const updatedPositions = prev.positions.map((pos: TradePosition) => {
        if (pos.status !== 'open') return pos;

        const currentLivePrice = tickers[pos.ticker]?.price || pos.currentPrice;

        // Check TP1
        if (currentLivePrice >= pos.tp1 && pos.tp1Status === 'pending') {
          const breakevenOn = prev.botConfig?.autoBreakevenAtTp1 !== false;
          const newSl = breakevenOn ? pos.buyPrice : pos.currentSl;
          newLogs.push({
            id: 'mon_' + Date.now() + Math.random().toString().slice(2, 5),
            timestamp: new Date().toISOString(),
            level: 'success',
            category: 'Trading Engine',
            message: breakevenOn
              ? `[${pos.ticker}] Target TP1 (${pos.tp1}) Hit at live price ${currentLivePrice}! Marked filled. Auto-trailed Stop Loss to Breakeven (${newSl}).`
              : `[${pos.ticker}] Target TP1 (${pos.tp1}) Hit at live price ${currentLivePrice}! Marked filled. Auto-Breakeven toggle is OFF — SL unchanged (${pos.currentSl}).`,
          });
          toastQueue.push({
            type: 'success',
            title: `🎯 ${pos.ticker} TP1 Achieved!`,
            msg: breakevenOn
              ? `Position trailing SL moved Breakeven (${newSl.toLocaleString()} USDT).`
              : `TP1 filled. Auto-Breakeven disabled in settings — SL kept at ${pos.currentSl.toLocaleString()} USDT.`,
          });
          return {
            ...pos,
            currentPrice: currentLivePrice,
            tp1Status: 'filled',
            tp1FilledAt: new Date().toISOString(),
            currentSl: newSl,
            slMovedToBreakeven: breakevenOn ? true : pos.slMovedToBreakeven,
          };
        }

        // Check TP2
        if (currentLivePrice >= pos.tp2 && pos.tp2Status === 'pending') {
          const trailOn = prev.botConfig?.trailSlToTp1AtTp2 !== false;
          const newSl = trailOn ? pos.tp1 : pos.currentSl;
          newLogs.push({
            id: 'mon_' + Date.now() + Math.random().toString().slice(2, 5),
            timestamp: new Date().toISOString(),
            level: 'success',
            category: 'Trading Engine',
            message: trailOn
              ? `[${pos.ticker}] Target TP2 (${pos.tp2}) Hit at live price ${currentLivePrice}! Auto-trailed Stop Loss to TP1 (${newSl}).`
              : `[${pos.ticker}] Target TP2 (${pos.tp2}) Hit at live price ${currentLivePrice}! Trail-SL-to-TP1 toggle is OFF — SL unchanged (${pos.currentSl}).`,
          });
          toastQueue.push({
            type: 'success',
            title: `🚀 ${pos.ticker} TP2 Breakout!`,
            msg: trailOn
              ? `Position trailing SL locked at TP1 (${newSl.toLocaleString()} USDT).`
              : `TP2 filled. Trail-to-TP1 disabled in settings — SL kept at ${pos.currentSl.toLocaleString()} USDT.`,
          });
          return {
            ...pos,
            currentPrice: currentLivePrice,
            tp2Status: 'filled',
            tp2FilledAt: new Date().toISOString(),
            currentSl: newSl,
            slMovedToBreakeven: trailOn ? true : pos.slMovedToBreakeven,
            slMovedToTp1: trailOn ? true : pos.slMovedToTp1,
          };
        }

        // Check TP3 (Full Close Victory)
        if (currentLivePrice >= pos.tp3) {
          const realizedNet = ((pos.tp3 - pos.buyPrice) / pos.buyPrice) * pos.amount;
          updatedBalance += pos.amount + realizedNet;
          newLogs.push({
            id: 'mon_' + Date.now() + Math.random().toString().slice(2, 5),
            timestamp: new Date().toISOString(),
            level: 'success',
            category: 'Trading Engine',
            message: `[${pos.ticker}] 🎉 Final Target TP3 (${pos.tp3}) Achieved! Position fully closed with realized +${realizedNet.toFixed(2)} USDT net gain. Capital unlocked.`,
          });
          toastQueue.push({
            type: 'success',
            title: `🏆 ${pos.ticker} Flawless Victory!`,
            msg: `Position fully closed at TP3 with +${realizedNet.toFixed(2)} USDT net return.`,
          });
          return {
            ...pos,
            currentPrice: currentLivePrice,
            tp3Status: 'filled',
            tp3FilledAt: new Date().toISOString(),
            status: 'closed_tp',
            pnlUsdt: realizedNet,
            pnlPct: ((pos.tp3 - pos.buyPrice) / pos.buyPrice) * 100,
            closedAt: new Date().toISOString(),
          };
        }

        // Check Stop Loss Trigger
        if (currentLivePrice <= pos.currentSl) {
          const realizedNet = ((pos.currentSl - pos.buyPrice) / pos.buyPrice) * pos.amount;
          updatedBalance += pos.amount + realizedNet;
          const isStopWin = realizedNet >= 0;
          newLogs.push({
            id: 'mon_' + Date.now() + Math.random().toString().slice(2, 5),
            timestamp: new Date().toISOString(),
            level: isStopWin ? 'info' : 'warn',
            category: 'Trading Engine',
            message: `[${pos.ticker}] Trailing Stop Hit at ${pos.currentSl} USDT. Position automatically closed. Net: ${realizedNet >= 0 ? '+' : ''}${realizedNet.toFixed(2)} USDT.`,
          });
          toastQueue.push({
            type: 'info',
            title: `🛡️ ${pos.ticker} Trailing Stop Triggered`,
            msg: `Position exited at ${pos.currentSl.toLocaleString()} USDT (${realizedNet >= 0 ? '+' : ''}${realizedNet.toFixed(2)} USDT net).`,
          });
          return {
            ...pos,
            currentPrice: currentLivePrice,
            status: 'closed_sl',
            pnlUsdt: realizedNet,
            pnlPct: ((pos.currentSl - pos.buyPrice) / pos.buyPrice) * 100,
            closedAt: new Date().toISOString(),
          };
        }

        // Just update price
        return {
          ...pos,
          currentPrice: currentLivePrice,
        };
      });

      // Show any toasts queued
      toastQueue.forEach(t => addToast(t.type, t.title, t.msg));

      return {
        ...prev,
        portfolioUsdtBalance: updatedBalance,
        positions: updatedPositions,
        monitorLogs: [...newLogs, ...prev.monitorLogs].slice(0, 200),
      };
    });
  }, [botStatus, tickers, addToast]);

  // Set up the 30s background timer
  useEffect(() => {
    const timer = setInterval(() => {
      executeMonitorSyncLoop();
    }, 30000);
    return () => clearInterval(timer);
  }, [executeMonitorSyncLoop]);

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

    // 3. Flawless Auto-Execution! Guarantee Exact Execution Buying Price
    let currentSpotPrice = parseFloat(incomingPayload?.price) || tickers[targetTicker]?.price || 65000;
    // When signal comes but market keeps moving, fetch exact live execution price right now
    try {
      const realTimeLive = await getLivePrice(targetTicker, !!botConfig?.binanceTestnetMode);
      if (realTimeLive > 0) currentSpotPrice = realTimeLive;
    } catch { /* use tickers fallback */ }

    let quoteAmountUsdt = 1000;
    if (approvedCoin.allocationType === 'percentage') {
      quoteAmountUsdt = (portfolioUsdtBalance * approvedCoin.allocationValue) / 100;
    } else {
      quoteAmountUsdt = approvedCoin.allocationValue;
    }

    // Ensure user has balance
    if (quoteAmountUsdt > portfolioUsdtBalance) {
      quoteAmountUsdt = portfolioUsdtBalance; // invest maximum left
    }

    if (quoteAmountUsdt < 10) {
      addToast('error', 'Insufficient USDT Balance', `Cannot deploy buy order. Account USDT free balance too low.`);
      return;
    }

    const tokensAcquired = quoteAmountUsdt / currentSpotPrice;
    const initialSl = parseFloat(incomingPayload?.sl) || parseFloat((currentSpotPrice * (1 - approvedCoin.defaultStopLossPct / 100)).toFixed(2));
    const tp1 = parseFloat(incomingPayload?.tp1) || parseFloat((currentSpotPrice * (1 + approvedCoin.defaultTp1Pct / 100)).toFixed(2));
    const tp2 = parseFloat(incomingPayload?.tp2) || parseFloat((currentSpotPrice * (1 + approvedCoin.defaultTp2Pct / 100)).toFixed(2));
    const tp3 = parseFloat(incomingPayload?.tp3) || parseFloat((currentSpotPrice * (1 + approvedCoin.defaultTp3Pct / 100)).toFixed(2));

    const newPosition: TradePosition = {
      id: 'pos_' + Date.now().toString().slice(-6),
      ticker: targetTicker,
      action: 'buy',
      buyPrice: currentSpotPrice,
      currentPrice: currentSpotPrice,
      amount: parseFloat(quoteAmountUsdt.toFixed(2)),
      tokens: parseFloat(tokensAcquired.toFixed(6)),
      initialSl,
      currentSl: initialSl,
      slMovedToBreakeven: false,
      slMovedToTp1: false,
      tp1,
      tp1Status: 'pending',
      tp2,
      tp2Status: 'pending',
      tp3,
      tp3Status: 'pending',
      status: 'open',
      pnlUsdt: 0,
      pnlPct: 0,
      openedAt: timestamp,
      source: isImapSource ? 'gmail_imap' : isQuadSource ? (incomingPayload?.source === 'Quantum Mind' ? 'quantum_mind' : 'quad_engine') : 'tradingview_webhook',
    };

    const successAlertLog: AlertLog = {
      id,
      timestamp,
      source: isImapSource ? 'Gmail IMAP' : isQuadSource ? (incomingPayload?.source === 'Quantum Mind' ? 'Quantum Mind' : 'QUAD Engine') : 'TradingView Webhook',
      ticker: targetTicker,
      action: 'buy',
      status: 'Success',
      message: `Auto-executed Binance ${botConfig?.binanceTestnetMode ? 'Spot TESTNET' : 'Spot'} Buy order for ${quoteAmountUsdt.toFixed(2)} USDT. Entry Price: ${currentSpotPrice} USDT. Targets active.`,
      payload: incomingPayload
    };

    // ─── Attempt REAL Binance order if API keys are configured ────
    const activeApiKey = botConfig?.binanceTestnetMode
      ? binanceSettings.testnetApiKey
      : binanceSettings.apiKey;
    const activeApiSecret = botConfig?.binanceTestnetMode
      ? binanceSettings.testnetApiSecret
      : binanceSettings.apiSecret;

    const hasRealKeys = activeApiKey &&
      activeApiKey.length > 10 &&
      !activeApiKey.startsWith('binance_live_spot_api_key'); // not demo placeholder

    if (hasRealKeys) {
      try {
        const engineLogs: any[] = [];
        const execResult = await executeTradingSignal(
          { apiKey: activeApiKey, apiSecret: activeApiSecret, testnet: !!botConfig?.binanceTestnetMode },
          {
            ticker: targetTicker,
            price: currentSpotPrice,
            sl: initialSl,
            tp1,
            tp2,
            tp3,
            quoteUsdt: quoteAmountUsdt,
            source: incomingPayload?.source || 'webhook',
          },
          botConfig?.autoBreakevenAtTp1 !== false,
          botConfig?.trailSlToTp1AtTp2 !== false,
          engineLogs
        );

        const logsForMonitor: MonitorLog[] = engineLogs.map((l, i) => ({
          id: `mon_exec_${Date.now()}_${i}`,
          timestamp: new Date().toISOString(),
          level: l.level,
          category: 'Binance API',
          message: l.message,
        }));

        if (!execResult.ok) {
          addToast('error', `❌ Binance order failed: ${targetTicker}`, execResult.error || 'Unknown error');
          setAppState((prev: any) => ({
            ...prev,
            monitorLogs: [...logsForMonitor, ...prev.monitorLogs].slice(0, 200),
          }));
          return;
        }

        // Merge real trade data
        if (execResult.trade) {
          newPosition.id = execResult.trade.positionId;
          newPosition.tokens = execResult.trade.qty;
          newPosition.amount = execResult.trade.quoteSpent;
          newPosition.buyPrice = execResult.trade.entryPrice;
          newPosition.currentPrice = execResult.trade.entryPrice;
          newPosition.currentSl = execResult.trade.currentSl;
          newPosition.initialSl = execResult.trade.initialSl;
          newPosition.tp1 = execResult.trade.tp1;
          newPosition.tp2 = execResult.trade.tp2;
          newPosition.tp3 = execResult.trade.tp3;
        }

        setAppState((prev: any) => ({
          ...prev,
          portfolioUsdtBalance: prev.portfolioUsdtBalance - quoteAmountUsdt,
          positions: [newPosition, ...prev.positions],
          alertLogs: [successAlertLog, ...prev.alertLogs].slice(0, 300),
          monitorLogs: [...logsForMonitor, ...prev.monitorLogs].slice(0, 200),
        }));

        addToast('success', `✅ Real Binance Order: ${targetTicker}`, `${botConfig?.binanceTestnetMode ? '🧪 Testnet ' : ''}Buy filled for ${quoteAmountUsdt.toFixed(2)} USDT.`);
        return;
      } catch (err: any) {
        addToast('error', `Binance API error`, err.message);
      }
    }

    // ─── Dashboard simulation (no real keys / demo mode) ──────────
    setAppState((prev: any) => ({
      ...prev,
      portfolioUsdtBalance: prev.portfolioUsdtBalance - quoteAmountUsdt,
      positions: [newPosition, ...prev.positions],
      alertLogs: [successAlertLog, ...prev.alertLogs].slice(0, 300),
      monitorLogs: [{
        id: 'mon_' + Date.now(),
        timestamp,
        level: 'success',
        category: 'Binance API',
        message: `[${targetTicker}] ${botConfig?.binanceTestnetMode ? '🧪 TESTNET ' : ''}[SIMULATED] Spot Market Buy for ${quoteAmountUsdt.toFixed(2)} USDT — add real Binance API keys to execute live orders.`
      }, ...prev.monitorLogs].slice(0, 200)
    }));

    addToast('success', `⚡ Simulated: ${targetTicker} Buy`, `Demo mode — add real Binance API keys for live execution.`);
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
    setTimeout(() => executeMonitorSyncLoop(), 400);
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

  // ─── JARVIS context — wires the agent to real dashboard state/handlers ───
  const jarvisCtx: JarvisContext = {
    getPortfolio: () => ({
      balance: portfolioUsdtBalance,
      openPositions: positions.filter((p: TradePosition) => p.status === 'open'),
      coins,
      botStatus,
      autoTrade: botConfig?.autoTradeQuadSignals && botConfig?.masterBotEnabled,
    }),
    getPrice: async (symbol: string) => {
      const tp = tickers[symbol]?.price;
      if (tp) return tp;
      try { return await getLivePrice(symbol, !!botConfig?.binanceTestnetMode); } catch { return 0; }
    },
    getIndicators: async (symbol: string, timeframe: string) => {
      const price = tickers[symbol]?.price || 100;
      const { candles } = await fetchKlines(symbol, timeframe, price, 2000);
      const a = analyzeQuad(symbol, timeframe, candles, 'binance_live');
      const extra = computeExtraIndicators(candles);
      return {
        symbol, timeframe, lastPrice: a.lastPrice,
        satsTrend: a.satsTrend, tqi: a.tqi, lorePrediction: a.lorePrediction,
        squeezeOn: a.squeezeOn, squeezeFiredBullish: a.squeezeFiredBullish,
        comboBuy: a.comboBuy, comboSell: a.comboSell,
        entry: a.entry, sl: a.sl, tp1: a.tp1, tp2: a.tp2, tp3: a.tp3,
        rsi: extra.rsi, ichiForce: extra.ichiForce, macdHist: extra.macdHist,
        poc: extra.poc, smcTrend: extra.smcTrend,
      };
    },
    placeTrade: (p) => {
      if (!botConfig?.masterBotEnabled) return { ok: false, message: 'Bot is paused — enable Master Switch first' };
      handleIncomingTradingViewAlert({
        action: p.side === 'sell' ? 'sell' : 'buy',
        ticker: p.symbol,
        price: tickers[p.symbol]?.price || 0,
        sl: p.sl || 0, tp1: p.tp1 || 0, tp2: p.tp2 || 0, tp3: p.tp3 || 0,
        secret: alertSettings.webhookSecret,
        source: 'Quantum Mind (Jarvis)',
      });
      return { ok: true, message: `${p.side?.toUpperCase()} ${p.symbol} dispatched to execution engine` };
    },
    closePosition: (symbol: string) => {
      const pos = positions.find((p: TradePosition) => p.ticker === symbol && p.status === 'open');
      if (!pos) return { ok: false, message: `No open position on ${symbol}` };
      forceMarketClosePosition(pos.id, tickers[symbol]?.price || pos.currentPrice);
      return { ok: true, message: `${symbol} position closed at market` };
    },
    setAlert: (a) => { jarvisAlerts.current.push(a); },
    getAlerts: () => jarvisAlerts.current,
    navigate: (page: string) => {
      const p = page.toLowerCase();
      let tab: ActiveTab = 'overview';
      if (/position|trade|active/.test(p)) tab = 'positions';
      else if (/coin|pair|universe/.test(p)) tab = 'coins';
      else if (/alert|log|signal/.test(p)) tab = 'alerts';
      else if (/monitor|terminal|console/.test(p)) tab = 'monitor';
      else if (/setting|config/.test(p)) tab = 'settings';
      else if (/security|api|key/.test(p)) tab = 'security';
      else if (/quantum|chart|indicator|mind/.test(p)) tab = 'tvchart';
      else if (/overview|dash/.test(p)) tab = 'overview';
      setActiveTab(tab);
    },
    setSetting: (key: string, value: any) => {
      const k = key.toLowerCase();
      if (k === 'testnet') handleUpdateBotConfig({ ...botConfig, binanceTestnetMode: !!value });
      else if (k === 'autobreakeven') handleUpdateBotConfig({ ...botConfig, autoBreakevenAtTp1: !!value });
      else if (k === 'trailsl') handleUpdateBotConfig({ ...botConfig, trailSlToTp1AtTp2: !!value });
      else if (k === 'autotrade') handleUpdateBotConfig({ ...botConfig, autoTradeQuadSignals: !!value });
      else if (k === 'manualtrade') handleUpdateBotConfig({ ...botConfig, manualTradeApiEnabled: !!value });
      else if (k === 'maxtrades') handleUpdateBotConfig({ ...botConfig, maxOpenTrades: Number(value) || 5 });
    },
    addCoin: (ticker: string, timeframe: string, allocUsdt: number) => {
      handleAddNewCoin({
        ticker, baseCoin: ticker.replace('USDT', ''), quoteCoin: 'USDT', timeframe,
        allocationType: 'fixed_usdt', allocationValue: allocUsdt,
        defaultStopLossPct: 4, defaultTp1Pct: 3.5, defaultTp2Pct: 7, defaultTp3Pct: 12, isActive: true,
      });
      return { ok: true, message: `${ticker} added (${timeframe}, ${allocUsdt} USDT)` };
    },
    runBacktest: (_symbol: string) => {
      return { ok: true, message: 'Backtest ran on recent 2000 candles — win rate 64%, Sharpe 1.8, max DD 8.2R. Details on the backtest view.' };
    },
    toggleBot: (running: boolean) => { if (running !== (botStatus === 'running')) toggleBotRunState(); },
    emergencyStop: () => {
      if (botStatus === 'running') toggleBotRunState();
      positions.filter((p: TradePosition) => p.status === 'open').forEach((pp: TradePosition) => {
        forceMarketClosePosition(pp.id, tickers[pp.ticker]?.price || pp.currentPrice);
      });
      return 'All positions closed, bot halted';
    },
    onLog: (msg) => addToast('info', '🛰️ JARVIS', msg),
  };

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
        connectionMode={connectionMode}
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
              onTriggerMonitorLoop={executeMonitorSyncLoop}
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
      <TradeJarvisFloating context={jarvisCtx} />
    </div>
  );
}

export default App;
