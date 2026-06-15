import { 
  AdminUser, 
  BinanceSettings, 
  AlertSettings, 
  TradeableCoin, 
  TradePosition, 
  AlertLog, 
  MonitorLog,
  BotConfig
} from './types';

export const initialBotConfig: BotConfig = {
  masterBotEnabled: true,
  autoBreakevenAtTp1: true,
  trailSlToTp1AtTp2: true,
  autoTradeQuadSignals: true,
  manualTradeApiEnabled: false,
  binanceTestnetMode: false,
  maxOpenTrades: 5,
};

export const initialUser: AdminUser = {
  email: 'admin@example.com',
  isLoggedIn: true, // Auto log in for demo preview or easily toggleable
  lastLogin: new Date().toISOString(),
};

export const initialBinanceSettings: BinanceSettings = {
  apiKey: '',
  apiSecret: '',
  testnetApiKey: '',
  testnetApiSecret: '',
  isEncrypted: false,
  encryptionKeyHint: 'Set ENCRYPTION_KEY env var for AES-256-GCM at rest',
  serverIp: '',
};

export const initialAlertSettings: AlertSettings = {
  webhookEnabled: false, // OFF by default — QUAD engine is self-contained, no TV needed
  webhookSecret: 'webhook_secret_binance_spot_2026',
  webhookUrl: 'https://api.yourdomain.com/api/webhook',
  imapEnabled: false,    // OFF by default — needs TV Pro+ for email alerts
  emailAccount: '',
  emailPassword: '',
  imapHost: 'imap.gmail.com',
  imapPort: 993,
};

export const initialCoins: TradeableCoin[] = [
  {
    id: 'coin_btc',
    ticker: 'BTCUSDT',
    baseCoin: 'BTC',
    quoteCoin: 'USDT',
    allocationType: 'percentage',
    allocationValue: 20, // 20% of portfolio
    defaultStopLossPct: 3.5,
    defaultTp1Pct: 3.0,
    defaultTp2Pct: 6.0,
    defaultTp3Pct: 10.0,
    isActive: true,
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
  },
  {
    id: 'coin_eth',
    ticker: 'ETHUSDT',
    baseCoin: 'ETH',
    quoteCoin: 'USDT',
    allocationType: 'percentage',
    allocationValue: 20,
    defaultStopLossPct: 4.0,
    defaultTp1Pct: 4.0,
    defaultTp2Pct: 8.0,
    defaultTp3Pct: 14.0,
    isActive: true,
    createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
  },
  {
    id: 'coin_sol',
    ticker: 'SOLUSDT',
    baseCoin: 'SOL',
    quoteCoin: 'USDT',
    allocationType: 'fixed_usdt',
    allocationValue: 1500,
    defaultStopLossPct: 5.0,
    defaultTp1Pct: 5.0,
    defaultTp2Pct: 10.0,
    defaultTp3Pct: 18.0,
    isActive: true,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
  {
    id: 'coin_bnb',
    ticker: 'BNBUSDT',
    baseCoin: 'BNB',
    quoteCoin: 'USDT',
    allocationType: 'fixed_usdt',
    allocationValue: 1000,
    defaultStopLossPct: 3.0,
    defaultTp1Pct: 3.0,
    defaultTp2Pct: 6.0,
    defaultTp3Pct: 9.0,
    isActive: true,
    createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
  },
  {
    id: 'coin_sui',
    ticker: 'SUIUSDT',
    baseCoin: 'SUI',
    quoteCoin: 'USDT',
    allocationType: 'fixed_usdt',
    allocationValue: 800,
    defaultStopLossPct: 6.0,
    defaultTp1Pct: 6.0,
    defaultTp2Pct: 12.0,
    defaultTp3Pct: 22.0,
    isActive: true,
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'coin_doge',
    ticker: 'DOGEUSDT',
    baseCoin: 'DOGE',
    quoteCoin: 'USDT',
    allocationType: 'fixed_usdt',
    allocationValue: 500,
    defaultStopLossPct: 5.0,
    defaultTp1Pct: 5.0,
    defaultTp2Pct: 10.0,
    defaultTp3Pct: 20.0,
    isActive: false,
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  }
];

export const initialPositions: TradePosition[] = [];

// Sample data kept for reference; remove in production
// @ts-ignore unused
const _samplePositions: TradePosition[] = [
  {
    id: 'pos_btc_1',
    ticker: 'BTCUSDT',
    action: 'buy',
    buyPrice: 65200,
    currentPrice: 67350,
    amount: 5000,
    tokens: 0.076687,
    initialSl: 63000,
    currentSl: 65200, // Trailed to Breakeven
    slMovedToBreakeven: true,
    slMovedToTp1: false,
    tp1: 67000,
    tp1Status: 'filled',
    tp1FilledAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    tp2: 69000,
    tp2Status: 'pending',
    tp3: 71500,
    tp3Status: 'pending',
    status: 'open',
    pnlUsdt: 164.88,
    pnlPct: 3.29,
    openedAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    source: 'tradingview_webhook',
  },
  {
    id: 'pos_sol_2',
    ticker: 'SOLUSDT',
    action: 'buy',
    buyPrice: 182.40,
    currentPrice: 186.10,
    amount: 1500,
    tokens: 8.22368,
    initialSl: 173.00,
    currentSl: 173.00,
    slMovedToBreakeven: false,
    slMovedToTp1: false,
    tp1: 191.50,
    tp1Status: 'pending',
    tp2: 200.00,
    tp2Status: 'pending',
    tp3: 215.00,
    tp3Status: 'pending',
    status: 'open',
    pnlUsdt: 30.42,
    pnlPct: 2.02,
    openedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    source: 'gmail_imap',
  },
  {
    id: 'pos_eth_3',
    ticker: 'ETHUSDT',
    action: 'buy',
    buyPrice: 3410.00,
    currentPrice: 3385.00,
    amount: 3000,
    tokens: 0.87976,
    initialSl: 3270.00,
    currentSl: 3270.00,
    slMovedToBreakeven: false,
    slMovedToTp1: false,
    tp1: 3546.00,
    tp1Status: 'pending',
    tp2: 3680.00,
    tp2Status: 'pending',
    tp3: 3880.00,
    tp3Status: 'pending',
    status: 'open',
    pnlUsdt: -21.99,
    pnlPct: -0.73,
    openedAt: new Date(Date.now() - 1 * 3600000).toISOString(),
    source: 'tradingview_webhook',
  },
  // Some Closed Trades for analytics
  {
    id: 'pos_sui_4',
    ticker: 'SUIUSDT',
    action: 'buy',
    buyPrice: 3.10,
    currentPrice: 3.78,
    amount: 800,
    tokens: 258.06,
    initialSl: 2.90,
    currentSl: 3.45,
    slMovedToBreakeven: true,
    slMovedToTp1: true,
    tp1: 3.30,
    tp1Status: 'filled',
    tp2: 3.45,
    tp2Status: 'filled',
    tp3: 3.78,
    tp3Status: 'filled',
    status: 'closed_tp',
    pnlUsdt: 175.48,
    pnlPct: 21.93,
    openedAt: new Date(Date.now() - 28 * 3600000).toISOString(),
    closedAt: new Date(Date.now() - 14 * 3600000).toISOString(),
    source: 'tradingview_webhook',
  },
  {
    id: 'pos_btc_5',
    ticker: 'BTCUSDT',
    action: 'buy',
    buyPrice: 63500,
    currentPrice: 66800,
    amount: 4000,
    tokens: 0.06299,
    initialSl: 61500,
    currentSl: 65000,
    slMovedToBreakeven: true,
    slMovedToTp1: true,
    tp1: 65000,
    tp1Status: 'filled',
    tp2: 66800,
    tp2Status: 'filled',
    tp3: 68500,
    tp3Status: 'pending',
    status: 'closed_manual',
    pnlUsdt: 207.86,
    pnlPct: 5.19,
    openedAt: new Date(Date.now() - 48 * 3600000).toISOString(),
    closedAt: new Date(Date.now() - 36 * 3600000).toISOString(),
    source: 'gmail_imap',
  },
  {
    id: 'pos_bnb_6',
    ticker: 'BNBUSDT',
    action: 'buy',
    buyPrice: 610.00,
    currentPrice: 591.00,
    amount: 1000,
    tokens: 1.6393,
    initialSl: 591.00,
    currentSl: 591.00,
    slMovedToBreakeven: false,
    slMovedToTp1: false,
    tp1: 630.00,
    tp1Status: 'pending',
    tp2: 650.00,
    tp2Status: 'pending',
    tp3: 675.00,
    tp3Status: 'pending',
    status: 'closed_sl',
    pnlUsdt: -31.14,
    pnlPct: -3.11,
    openedAt: new Date(Date.now() - 72 * 3600000).toISOString(),
    closedAt: new Date(Date.now() - 65 * 3600000).toISOString(),
    source: 'tradingview_webhook',
  }
];

export const initialAlertLogs: AlertLog[] = [];

// @ts-ignore unused
const _sampleAlertLogs: AlertLog[] = [
  {
    id: 'alert_1',
    timestamp: new Date(Date.now() - 10 * 60000).toISOString(),
    source: 'TradingView Webhook',
    ticker: 'BTCUSDT',
    action: 'buy',
    status: 'Success',
    message: 'Valid alert received. Auto-executed Binance Spot Buy order #849201. Target TP1: 67,000 USDT.',
    payload: { action: 'buy', ticker: 'BTCUSDT', price: 65200, sl: 63000, tp1: 67000, tp2: 69000, tp3: 71500 },
  },
  {
    id: 'alert_2',
    timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
    source: 'TradingView Webhook',
    ticker: 'XRPUSDT',
    action: 'buy',
    status: 'Rejected',
    message: 'Rejected: Coin XRPUSDT is not in the active Tradeable Coins list.',
    payload: { action: 'buy', ticker: 'XRPUSDT', price: 2.34, sl: 2.20, tp1: 2.50 },
  },
  {
    id: 'alert_3',
    timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
    source: 'Gmail IMAP',
    ticker: 'SOLUSDT',
    action: 'buy',
    status: 'Success',
    message: 'Parsed IMAP alert from TradingView Email. Executed Spot order for 1500 USDT.',
    payload: { subject: 'Alert: SOLUSDT Buy Signal 1h breakout', ticker: 'SOLUSDT', price: 182.40 },
  },
  {
    id: 'alert_4',
    timestamp: new Date(Date.now() - 240 * 60000).toISOString(),
    source: 'TradingView Webhook',
    ticker: 'ETHUSDT',
    action: 'sell',
    status: 'Invalid Secret',
    message: 'Webhook authentication failed. WEBHOOK_SECRET mismatch. Alert dropped.',
    payload: { action: 'sell', ticker: 'ETHUSDT', secret: 'wrong_secret_123' },
  }
];

export const initialMonitorLogs: MonitorLog[] = [];

// @ts-ignore unused
const _sampleMonitorLogs: MonitorLog[] = [
  {
    id: 'mon_1',
    timestamp: new Date(Date.now() - 5000).toISOString(),
    level: 'success',
    category: 'Monitor',
    message: 'Background monitor loop completed in 142ms. 3 active spot positions verified against Binance API.',
  },
  {
    id: 'mon_2',
    timestamp: new Date(Date.now() - 35000).toISOString(),
    level: 'info',
    category: 'Trading Engine',
    message: 'Checked BTCUSDT order #849201. Current price 67,350 > TP1 (67,000). Trailing SL automatically locked Breakeven (65,200).',
  },
  {
    id: 'mon_3',
    timestamp: new Date(Date.now() - 65000).toISOString(),
    level: 'success',
    category: 'Security',
    message: 'Binance API keys validated successfully. Connection encrypted at rest (AES-256-GCM status: secure).',
  },
  {
    id: 'mon_4',
    timestamp: new Date(Date.now() - 95000).toISOString(),
    level: 'info',
    category: 'Monitor',
    message: 'Polling Binance spot WebSocket ticker streams for 5 active tradeable coins.',
  }
];

// Local storage management helpers
export const loadAppState = () => {
  try {
    const saved = localStorage.getItem('crypto_bot_dashboard_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Version check — clear stale demo data from development
      const version = parsed._version || 0;
      if (version < 2) {
        localStorage.removeItem('crypto_bot_dashboard_state');
        // Fall through to return fresh defaults
      } else {
        // Merge bot config defaults for users upgrading from an older saved state
        return {
          ...parsed,
          botConfig: { ...initialBotConfig, ...(parsed.botConfig || {}) },
          alertSettings: { ...initialAlertSettings, ...(parsed.alertSettings || {}) },
          binanceSettings: { ...initialBinanceSettings, ...(parsed.binanceSettings || {}) },
        };
      }
    }
  } catch (e) {
    console.error('Failed to load app state from localStorage', e);
  }
  return {
    botStatus: 'running' as const,
    user: initialUser,
    binanceSettings: initialBinanceSettings,
    alertSettings: initialAlertSettings,
    coins: initialCoins,
    positions: initialPositions,
    alertLogs: initialAlertLogs,
    monitorLogs: initialMonitorLogs,
    portfolioUsdtBalance: 0,
    botConfig: initialBotConfig,
    _version: 2,
  };
};

export const saveAppState = (state: any) => {
  try {
    localStorage.setItem('crypto_bot_dashboard_state', JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save app state to localStorage', e);
  }
};
