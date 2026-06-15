export type BotStatus = 'running' | 'paused' | 'error';

export interface AdminUser {
  email: string;
  isLoggedIn: boolean;
  lastLogin: string;
}

export interface BinanceSettings {
  apiKey: string;
  apiSecret: string;
  testnetApiKey: string;
  testnetApiSecret: string;
  isEncrypted: boolean;
  encryptionKeyHint: string;
  serverIp: string;
}

export interface AlertSettings {
  webhookEnabled: boolean;
  webhookSecret: string;
  webhookUrl: string;
  imapEnabled: boolean;
  emailAccount?: string;
  emailPassword?: string;
  imapHost?: string;
  imapPort?: number;
}

export interface TradeableCoin {
  id: string;
  ticker: string; // e.g. BTCUSDT
  baseCoin: string; // e.g. BTC
  quoteCoin: string; // e.g. USDT
  timeframe?: string; // QUAD monitor timeframe, e.g. '1h' (default)
  allocationType: 'percentage' | 'fixed_usdt';
  allocationValue: number; // e.g. 15% or 500 USDT
  defaultStopLossPct: number; // e.g. 3%
  defaultTp1Pct: number; // e.g. 3%
  defaultTp2Pct: number; // e.g. 6%
  defaultTp3Pct: number; // e.g. 10%
  isActive: boolean;
  createdAt: string;
}

export interface TradePosition {
  id: string;
  ticker: string;
  action: 'buy';
  buyPrice: number;
  currentPrice: number;
  amount: number; // Quote coin amount invested (USDT)
  tokens: number; // Base coin units acquired
  
  // Stop loss & Take profit tiers
  initialSl: number;
  currentSl: number;
  slMovedToBreakeven: boolean;
  slMovedToTp1: boolean;
  
  tp1: number;
  tp1Status: 'pending' | 'filled';
  tp1FilledAt?: string;
  
  tp2: number;
  tp2Status: 'pending' | 'filled';
  tp2FilledAt?: string;
  
  tp3: number;
  tp3Status: 'pending' | 'filled';
  tp3FilledAt?: string;
  
  status: 'open' | 'closed_tp' | 'closed_sl' | 'closed_manual';
  pnlUsdt: number;
  pnlPct: number;
  openedAt: string;
  closedAt?: string;
  source: 'tradingview_webhook' | 'gmail_imap' | 'manual_dashboard' | 'quad_engine' | 'quantum_mind';
}

export interface AlertLog {
  id: string;
  timestamp: string;
  source: 'TradingView Webhook' | 'Gmail IMAP' | 'QUAD Engine' | 'Quantum Mind';
  ticker: string;
  action: string;
  status: 'Success' | 'Rejected' | 'Invalid Secret' | 'Error';
  message: string;
  payload?: any;
}

export interface MonitorLog {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  category: 'Monitor' | 'Binance API' | 'Trading Engine' | 'Security';
  message: string;
}

export interface BotConfig {
  masterBotEnabled: boolean;       // Master switch: enable/disable all automated execution
  autoBreakevenAtTp1: boolean;     // Move SL to entry when TP1 hits
  trailSlToTp1AtTp2: boolean;      // Move SL to TP1 when TP2 hits
  autoTradeQuadSignals: boolean;   // Auto open trade when SATS & Lorentzian agree on Combo BUY
  manualTradeApiEnabled: boolean;  // Allow manual trades via /api/manual-trade endpoint
  binanceTestnetMode: boolean;     // Execute all trades on Binance Spot Testnet
  maxOpenTrades: number;           // Max simultaneous open trades for auto QUAD trading
}

export interface LiveTicker {
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume: number;
}
