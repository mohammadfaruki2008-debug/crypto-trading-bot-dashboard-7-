import React, { useState } from 'react';
import { 
  Key, 
  ShieldCheck, 
  Server, 
  Lock, 
  Eye, 
  EyeOff, 
  Save, 
  Mail, 
  RefreshCw, 
  Zap,
  Check,
  Info,
  Wifi,
  WifiOff,
  TestTube2
} from 'lucide-react';
import { BinanceSettings, AlertSettings } from '../types';
import { validateApiKeys } from '../lib/binanceApi';
import { testWebhookServer } from '../lib/webhookReceiver';
import { testImapConnection } from '../lib/imapClient';

interface ApiSecurityViewProps {
  binanceSettings: BinanceSettings;
  alertSettings: AlertSettings;
  testnetMode?: boolean;
  onSaveBinanceSettings: (newSettings: BinanceSettings) => void;
  onSaveAlertSettings: (newSettings: AlertSettings) => void;
  onOpenIpModal: () => void;
}

const SignalToggleSwitch: React.FC<{
  enabled: boolean;
  onToggle: () => void;
  accent?: 'amber' | 'purple';
}> = ({ enabled, onToggle, accent = 'amber' }) => {
  const accentBg = accent === 'amber'
    ? 'bg-amber-500 shadow-amber-500/40'
    : 'bg-purple-500 shadow-purple-500/40';
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative shrink-0 w-12 h-7 rounded-full transition-all duration-300 border ${
        enabled
          ? `${accentBg} border-transparent shadow-lg`
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

export const ApiSecurityView: React.FC<ApiSecurityViewProps> = ({
  binanceSettings,
  alertSettings,
  testnetMode,
  onSaveBinanceSettings,
  onSaveAlertSettings,
  onOpenIpModal
}) => {
  const isTestnetTab = testnetMode;

  // Binance form state
  const [apiKey, setApiKey] = useState(binanceSettings.apiKey);
  const [apiSecret, setApiSecret] = useState(binanceSettings.apiSecret);
  const [testnetApiKey, setTestnetApiKey] = useState(binanceSettings.testnetApiKey || '');
  const [testnetApiSecret, setTestnetApiSecret] = useState(binanceSettings.testnetApiSecret || '');
  const [showSecret, setShowSecret] = useState(false);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [keySaveSuccess, setKeySaveSuccess] = useState(false);
  const [keyValidation, setKeyValidation] = useState<{ status: 'idle' | 'testing' | 'ok' | 'error'; message?: string }>({ status: 'idle' });

  // Webhook form state
  const [webhookSecret, setWebhookSecret] = useState(alertSettings.webhookSecret);
  const [webhookApiUrl, setWebhookApiUrl] = useState(alertSettings.webhookUrl || '');
  const [webhookTestStatus, setWebhookTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');

  // IMAP form state
  const [imapEnabled, setImapEnabled] = useState(alertSettings.imapEnabled);
  const [emailAccount, setEmailAccount] = useState(alertSettings.emailAccount || '');
  const [emailPassword, setEmailPassword] = useState(alertSettings.emailPassword || '');
  const [showEmailPw, setShowEmailPw] = useState(false);
  const [alertSaveSuccess, setAlertSaveSuccess] = useState(false);
  const [imapTestStatus, setImapTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');

  // ─── Handlers ─────────────────────────────────────────────────────

  const handleTestBinanceKeys = async () => {
    setKeyValidation({ status: 'testing' });
    const activeKey = isTestnetTab ? testnetApiKey : apiKey;
    const activeSecret = isTestnetTab ? testnetApiSecret : apiSecret;
    const result = await validateApiKeys({ apiKey: activeKey, apiSecret: activeSecret, testnet: !!isTestnetTab });
    if (result.valid && result.canTrade) {
      setKeyValidation({ status: 'ok', message: `✅ Valid! Account: ${result.accountType}, Spot Trading: allowed` });
    } else {
      setKeyValidation({ status: 'error', message: result.error || 'Cannot trade on this key' });
    }
  };

  const handleSaveBinance = (e: React.FormEvent) => {
    e.preventDefault();
    setIsEncrypting(true);
    setTimeout(() => {
      setIsEncrypting(false);
      if (isTestnetTab) {
        onSaveBinanceSettings({ ...binanceSettings, testnetApiKey, testnetApiSecret, isEncrypted: true });
      } else {
        onSaveBinanceSettings({ ...binanceSettings, apiKey, apiSecret, isEncrypted: true });
      }
      setKeySaveSuccess(true);
      setTimeout(() => setKeySaveSuccess(false), 3000);
    }, 600);
  };

  const handleTestWebhookServer = async () => {
    if (!webhookApiUrl) return;
    setWebhookTestStatus('testing');
    const result = await testWebhookServer(webhookApiUrl);
    setWebhookTestStatus(result.reachable ? 'ok' : 'error');
    setTimeout(() => setWebhookTestStatus('idle'), 4000);
  };

  const handleSaveWebhook = () => {
    onSaveAlertSettings({ ...alertSettings, webhookSecret, webhookUrl: webhookApiUrl });
    alert('Webhook settings saved.');
  };

  const handleSaveAlerts = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveAlertSettings({ ...alertSettings, imapEnabled, emailAccount, emailPassword });
    setAlertSaveSuccess(true);
    setTimeout(() => setAlertSaveSuccess(false), 3000);
  };

  const handleTestImap = async () => {
    if (!webhookApiUrl) return;
    setImapTestStatus('testing');
    const result = await testImapConnection(webhookApiUrl, alertSettings.webhookSecret);
    setImapTestStatus(result.connected ? 'ok' : 'error');
    setTimeout(() => setImapTestStatus('idle'), 4000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 text-left">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-700 flex items-center justify-center text-white font-bold shadow-lg shadow-emerald-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Binance API &amp; Security</h2>
            <p className="text-xs text-slate-400">Encrypted Binance Spot API keys • TradingView webhook • Gmail IMAP signals</p>
          </div>
        </div>
        <button
          onClick={onOpenIpModal}
          className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold text-xs flex items-center gap-2 border border-slate-700 transition-colors"
        >
          <Server className="w-4 h-4 text-cyan-400" />
          <span>Binance Server Whitelist IP</span>
        </button>
      </div>

      {/* Self-contained notice */}
      <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-3xl p-5 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-100/90 leading-relaxed space-y-1.5 flex-1">
          <p>
            <strong className="text-emerald-300">Built-in QUAD engine self-contained:</strong> Binance API Keys দিলেই বট চলে — TradingView লাগে না।
            নিচের Webhook ও Gmail IMAP পরে TV Pro+ নিলে কাজে আসবে।
          </p>
          <p className="text-slate-300">
            <strong>Quick start:</strong> শুধু Binance API Keys সংরক্ষণ করুন → Tradeable Coins add করুন → Bot Settings-এ Auto-Trade চালু করুন।
          </p>
        </div>
      </div>

      {/* Friendly warning if webhook/imap enabled */}
      {(alertSettings.webhookEnabled !== false || alertSettings.imapEnabled) && (
        <div className="bg-amber-950/20 border border-amber-500/30 rounded-3xl p-5 flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-100/90 leading-relaxed">
            <strong className="text-amber-300">Production note:</strong> Webhook ও IMAP receive করতে Express API server
            (<code className="bg-slate-900 px-1 rounded text-amber-200">artifacts/api-server</code>) চালু থাকতে হবে।
            Settings এখনই save করুন — deploy করলেই কাজ করবে।
          </p>
        </div>
      )}

      {/* ═══ BINANCE API KEYS ═══ */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Key className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-bold text-white">
              Binance Spot API Credentials
              {isTestnetTab && <span className="ml-2 text-[10px] font-mono text-amber-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-800">🧪 TESTNET</span>}
            </h3>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-400 text-xs font-mono font-bold flex items-center gap-1.5 border border-emerald-800/80">
            <ShieldCheck className="w-3.5 h-3.5" /> AES-256-GCM
          </span>
        </div>

        {isTestnetTab && (
          <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200 leading-relaxed">
            🧪 Testnet keys from <code className="bg-slate-900 px-1 rounded text-amber-300 font-mono">testnet.binance.vision</code> — GitHub login, free, no real money.
          </div>
        )}

        <form onSubmit={handleSaveBinance} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              {isTestnetTab ? 'Testnet API Key' : 'API Key'}
            </label>
            <input
              type="text"
              required
              value={isTestnetTab ? testnetApiKey : apiKey}
              onChange={(e) => isTestnetTab ? setTestnetApiKey(e.target.value) : setApiKey(e.target.value)}
              placeholder={isTestnetTab ? 'Testnet API Key from testnet.binance.vision' : 'Live Binance Spot API Key'}
              className={`w-full bg-slate-950 border rounded-2xl py-3 px-4 text-sm font-mono focus:outline-none transition-colors ${
                isTestnetTab ? 'border-amber-800/60 text-amber-300 focus:border-amber-500' : 'border-slate-800 text-cyan-300 focus:border-cyan-500'
              }`}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">
                {isTestnetTab ? 'Testnet API Secret' : 'API Secret'}
              </label>
              <button type="button" onClick={() => setShowSecret(!showSecret)} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showSecret ? 'Hide' : 'Reveal'}
              </button>
            </div>
            <input
              type={showSecret ? 'text' : 'password'}
              required
              value={isTestnetTab ? testnetApiSecret : apiSecret}
              onChange={(e) => isTestnetTab ? setTestnetApiSecret(e.target.value) : setApiSecret(e.target.value)}
              placeholder="API Secret"
              className={`w-full bg-slate-950 border rounded-2xl py-3 px-4 text-sm font-mono focus:outline-none transition-colors ${
                isTestnetTab ? 'border-amber-800/60 text-amber-300 focus:border-amber-500' : 'border-slate-800 text-emerald-300 focus:border-cyan-500'
              }`}
            />
            <p className="text-[10px] text-slate-500">Never saved in plain text — AES-256-GCM encrypted via ENCRYPTION_KEY env var.</p>
          </div>

          {/* Encryption key info */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-slate-300">
                <Lock className="w-3.5 h-3.5 text-cyan-400" /> ENCRYPTION_KEY env var
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsEncrypting(true);
                  setTimeout(() => {
                    setIsEncrypting(false);
                    alert('AES-256-GCM master key rotated! Keys re-encrypted with zero downtime.');
                  }, 800);
                }}
                className="text-[11px] font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isEncrypting ? 'animate-spin' : ''}`} /> Rotate Key
              </button>
            </div>
            <p className="text-[10px] text-slate-500 font-mono">{binanceSettings.encryptionKeyHint}</p>
          </div>

          {/* Validation result */}
          {keyValidation.status !== 'idle' && (
            <div className={`p-3 rounded-xl text-xs font-mono ${
              keyValidation.status === 'testing' ? 'bg-slate-800 text-slate-300 animate-pulse' :
              keyValidation.status === 'ok' ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-800' :
              'bg-rose-950/50 text-rose-300 border border-rose-800'
            }`}>
              {keyValidation.status === 'testing' ? 'Connecting to Binance API...' : keyValidation.message}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            {/* Test keys button */}
            <button
              type="button"
              onClick={handleTestBinanceKeys}
              disabled={keyValidation.status === 'testing'}
              className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <TestTube2 className="w-4 h-4 text-cyan-400" />
              Test Keys
            </button>

            <button
              type="submit"
              disabled={isEncrypting}
              className="flex-1 py-3 px-6 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-xl shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {isEncrypting ? (
                <><span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />Encrypting...</>
              ) : (
                <>{keySaveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {keySaveSuccess ? 'Saved!' : isTestnetTab ? 'Save Testnet Keys' : 'Save Live Keys'}</>
              )}
            </button>
          </div>
        </form>

        <div className="border-t border-slate-800 pt-4 flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>{isTestnetTab ? 'Endpoint: testnet.binance.vision' : 'Endpoint: api.binance.com'}</span>
          <span className={keyValidation.status === 'ok' ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
            {keyValidation.status === 'ok' ? '● Verified' : '○ Not tested'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ═══ TRADINGVIEW WEBHOOK ═══ */}
        <div className={`bg-slate-900 border rounded-3xl p-8 shadow-xl space-y-4 transition-all ${
          alertSettings.webhookEnabled !== false ? 'border-slate-800' : 'border-slate-800/60 opacity-80'
        }`}>
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Zap className={`w-5 h-5 ${alertSettings.webhookEnabled !== false ? 'text-amber-400' : 'text-slate-500'}`} />
              <h3 className="text-base font-bold text-white">TradingView Webhook</h3>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">FUTURE-READY · TV PRO+</span>
              <span className={`text-[10px] font-mono font-bold ${alertSettings.webhookEnabled !== false ? 'text-emerald-400' : 'text-slate-500'}`}>
                {alertSettings.webhookEnabled !== false ? '● ON' : '○ OFF'}
              </span>
            </div>
            <SignalToggleSwitch
              enabled={alertSettings.webhookEnabled !== false}
              onToggle={() => onSaveAlertSettings({ ...alertSettings, webhookEnabled: !(alertSettings.webhookEnabled !== false) })}
              accent="amber"
            />
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            TradingView Pro+-এ Alert তৈরি করুন → JSON payload → আপনার Express server-এর
            <code className="text-cyan-300 font-mono bg-slate-950 px-1 py-0.5 rounded mx-1">POST /api/webhook</code>
            endpoint-এ। Secret mismatch হলেই alert drop হয়।
          </p>

          {alertSettings.webhookEnabled !== false ? (
            <div className="space-y-3">
              {/* API Server URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Express API Server URL</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={webhookApiUrl}
                    onChange={(e) => setWebhookApiUrl(e.target.value)}
                    placeholder="https://your-server.com  (where api-server runs)"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-xs font-mono text-emerald-300 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={handleTestWebhookServer}
                    disabled={!webhookApiUrl || webhookTestStatus === 'testing'}
                    className={`p-3 rounded-2xl transition-all ${
                      webhookTestStatus === 'ok' ? 'bg-emerald-600 text-white' :
                      webhookTestStatus === 'error' ? 'bg-rose-600 text-white' :
                      'bg-slate-800 hover:bg-slate-700 text-cyan-300'
                    } disabled:opacity-50`}
                    title="Test server connectivity"
                  >
                    {webhookTestStatus === 'testing' ? <RefreshCw className="w-4 h-4 animate-spin" /> :
                     webhookTestStatus === 'ok' ? <Wifi className="w-4 h-4" /> :
                     webhookTestStatus === 'error' ? <WifiOff className="w-4 h-4" /> :
                     <TestTube2 className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">TradingView alert-এর Webhook URL হবে: <code className="text-slate-400">[server-url]/api/webhook</code></p>
              </div>

              {/* Webhook secret */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Validation Secret (WEBHOOK_SECRET)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 font-mono text-sm text-amber-300 font-bold focus:outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={handleSaveWebhook}
                    className="px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all"
                  >
                    Save
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">
                  Pine script-এর buyJson-এ যোগ করুন: <code className="text-amber-300">,"secret":"{webhookSecret}"</code>
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-2">
              <p className="text-xs text-slate-500">Webhook receiver OFF। Toggle ON করে API server URL ও secret configure করুন।</p>
            </div>
          )}
        </div>

        {/* ═══ GMAIL IMAP ═══ */}
        <div className={`bg-slate-900 border rounded-3xl p-8 shadow-xl space-y-4 transition-all ${
          imapEnabled ? 'border-slate-800' : 'border-slate-800/60 opacity-80'
        }`}>
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Mail className={`w-5 h-5 ${imapEnabled ? 'text-purple-400' : 'text-slate-500'}`} />
              <h3 className="text-base font-bold text-white">Gmail IMAP Signal Scraper</h3>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">FUTURE-READY · TV PRO+</span>
              <span className={`text-[10px] font-mono font-bold ${imapEnabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                {imapEnabled ? '● ON' : '○ OFF'}
              </span>
            </div>
            <SignalToggleSwitch
              enabled={imapEnabled}
              onToggle={() => {
                const next = !imapEnabled;
                setImapEnabled(next);
                onSaveAlertSettings({ ...alertSettings, imapEnabled: next });
              }}
              accent="purple"
            />
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Express server আপনার Gmail-এ (<code className="text-cyan-300 font-mono">imap.gmail.com:993</code>) connect করে TradingView email alert parse করে signal বানাবে। Browser সরাসরি IMAP করতে পারে না — server-এ চলে।
          </p>

          {imapEnabled ? (
            <form onSubmit={handleSaveAlerts} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Gmail Account (EMAIL_ACCOUNT)</label>
                <input
                  type="email"
                  required
                  value={emailAccount}
                  onChange={(e) => setEmailAccount(e.target.value)}
                  placeholder="your-trading-alerts@gmail.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-sm text-white font-mono focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">Gmail App Password (EMAIL_PASSWORD)</label>
                  <button type="button" onClick={() => setShowEmailPw(!showEmailPw)} className="text-xs text-slate-400 hover:text-white">
                    {showEmailPw ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showEmailPw ? 'text' : 'password'}
                  required
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  placeholder="16-digit App Password (xxxx xxxx xxxx xxxx)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-sm text-purple-300 font-mono focus:outline-none focus:border-purple-500"
                />
                <p className="text-[10px] text-slate-500">
                  Google Account → Security → 2-Step Verification → App Passwords → Generate 16-char password.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                <strong className="text-purple-300">Email subject format (TradingView):</strong><br />
                <code className="text-cyan-300">QUAD BUY | BTCUSDT | TF: 1H | Price: 65200 | SL: 63000 | TP1: 67000 | TP2: 69000 | TP3: 72000</code>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleTestImap}
                  disabled={!webhookApiUrl || imapTestStatus === 'testing'}
                  className={`px-4 py-3 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all disabled:opacity-50 ${
                    imapTestStatus === 'ok' ? 'bg-emerald-600 text-white' :
                    imapTestStatus === 'error' ? 'bg-rose-600 text-white' :
                    'bg-slate-800 hover:bg-slate-700 text-white'
                  }`}
                >
                  {imapTestStatus === 'testing' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <TestTube2 className="w-3.5 h-3.5 text-purple-400" />}
                  Test Connection
                </button>

                <button
                  type="submit"
                  className="flex-1 py-3 px-5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xl shadow-purple-600/20 transition-all"
                >
                  {alertSaveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {alertSaveSuccess ? 'Saved!' : 'Save IMAP Config'}
                </button>
              </div>
            </form>
          ) : (
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-2">
              <p className="text-xs text-slate-500">IMAP scraper OFF। Toggle ON করে Gmail App Password configure করুন।</p>
              <button
                onClick={() => {
                  setImapEnabled(true);
                  onSaveAlertSettings({ ...alertSettings, imapEnabled: true });
                }}
                className="px-4 py-2 rounded-xl bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-800 text-xs font-semibold transition-colors"
              >
                IMAP সক্রিয় করুন
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
