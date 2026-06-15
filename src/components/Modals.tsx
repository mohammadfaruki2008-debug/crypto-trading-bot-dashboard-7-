import React, { useState } from 'react';
import { 
  X, 
  Send, 
  Copy, 
  Check, 
  Server, 
  Terminal, 
  Info,
  Sparkles,
  AlertTriangle
} from 'lucide-react';
import { TradeableCoin } from '../types';

interface ServerIpModalProps {
  serverIp: string;
  onClose: () => void;
}

export const BinanceServerIpModal: React.FC<ServerIpModalProps> = ({ serverIp, onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(serverIp);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="relative max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-left space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-mono">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Binance API Server IP</h3>
              <p className="text-xs text-slate-400">IP Whitelist Security Configuration</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="text-xs font-semibold text-slate-400 flex items-center justify-between">
              <span>Public IPv4 Endpoint</span>
              <span className="text-[10px] bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800 font-mono">Active Dedicated Static IP</span>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="text" 
                readOnly 
                value={serverIp}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 px-4 font-mono text-lg font-bold text-cyan-300 focus:outline-none select-all"
              />
              <button 
                onClick={handleCopy}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all shrink-0 ${
                  copied 
                    ? 'bg-emerald-600 text-white' 
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied IP' : 'Copy IP'}</span>
              </button>
            </div>
          </div>

          {/* Setup Guide */}
          <div className="space-y-3 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/80">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Info className="w-4 h-4 text-cyan-400" /> How to whitelist on Binance Spot
            </h4>
            <ol className="text-xs text-slate-300 space-y-2 pl-2">
              <li className="flex items-start gap-2">
                <span className="font-bold text-cyan-400">1.</span>
                <span>Log into Binance &rarr; Account &rarr; <strong className="text-white">API Management</strong>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-cyan-400">2.</span>
                <span>Create or Edit your Spot Trading API Key. Ensure <strong className="text-emerald-400">"Enable Spot &amp; Margin Trading"</strong> is checked.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-cyan-400">3.</span>
                <span>Under IP Access Restrictions, pick <strong className="text-white">"Restrict access to trusted IPs only"</strong>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-cyan-400">4.</span>
                <span>Paste the Server IP (<code className="bg-slate-800 px-1 py-0.5 rounded text-cyan-300 font-mono">{serverIp}</code>) above and confirm.</span>
              </li>
            </ol>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm transition-colors"
          >
            Close Assistant
          </button>
        </div>
      </div>
    </div>
  );
};

interface WebhookSimulatorModalProps {
  coins: TradeableCoin[];
  webhookSecret: string;
  onClose: () => void;
  onSimulateWebhook: (payload: any) => void;
}

export const TradingViewWebhookSimulatorModal: React.FC<WebhookSimulatorModalProps> = ({
  coins,
  webhookSecret,
  onClose,
  onSimulateWebhook
}) => {
  const activeCoins = coins.filter(c => c.isActive);
  const defaultTicker = activeCoins.length > 0 ? activeCoins[0].ticker : 'BTCUSDT';
  
  const [ticker, setTicker] = useState(defaultTicker);
  const [price, setPrice] = useState(67350);
  const [secretInput, setSecretInput] = useState(webhookSecret);
  
  // Custom JSON raw edit mode or guided mode
  const [mode, setMode] = useState<'guided' | 'raw'>('guided');
  const [rawJson, setRawJson] = useState<string>(() => {
    return JSON.stringify({
      action: "buy",
      ticker: defaultTicker,
      price: 67350,
      sl: 65000,
      tp1: 69300,
      tp2: 71000,
      tp3: 73500,
      secret: webhookSecret
    }, null, 2);
  });

  // Calculate smart default SL and TPs based on selected coin if available
  const updateGuidedValues = (selectedTicker: string, currentPrice: number) => {
    const coin = coins.find(c => c.ticker === selectedTicker);
    const slPct = coin ? coin.defaultStopLossPct : 3.5;
    const tp1Pct = coin ? coin.defaultTp1Pct : 3.0;
    const tp2Pct = coin ? coin.defaultTp2Pct : 6.0;
    const tp3Pct = coin ? coin.defaultTp3Pct : 10.0;

    const sl = parseFloat((currentPrice * (1 - slPct / 100)).toFixed(2));
    const tp1 = parseFloat((currentPrice * (1 + tp1Pct / 100)).toFixed(2));
    const tp2 = parseFloat((currentPrice * (1 + tp2Pct / 100)).toFixed(2));
    const tp3 = parseFloat((currentPrice * (1 + tp3Pct / 100)).toFixed(2));

    setRawJson(JSON.stringify({
      action: "buy",
      ticker: selectedTicker,
      price: currentPrice,
      sl,
      tp1,
      tp2,
      tp3,
      secret: secretInput
    }, null, 2));
  };

  const handleGuidedTickerChange = (newTicker: string) => {
    setTicker(newTicker);
    let samplePrice = 67350;
    if (newTicker === 'ETHUSDT') samplePrice = 3385;
    if (newTicker === 'SOLUSDT') samplePrice = 186;
    if (newTicker === 'BNBUSDT') samplePrice = 591;
    if (newTicker === 'SUIUSDT') samplePrice = 3.78;
    if (newTicker === 'DOGEUSDT') samplePrice = 0.285;
    setPrice(samplePrice);
    updateGuidedValues(newTicker, samplePrice);
  };

  const handleSend = () => {
    try {
      let payload;
      if (mode === 'raw') {
        payload = JSON.parse(rawJson);
      } else {
        const coin = coins.find(c => c.ticker === ticker);
        const slPct = coin ? coin.defaultStopLossPct : 3.5;
        const tp1Pct = coin ? coin.defaultTp1Pct : 3.0;
        const tp2Pct = coin ? coin.defaultTp2Pct : 6.0;
        const tp3Pct = coin ? coin.defaultTp3Pct : 10.0;

        payload = {
          action: "buy",
          ticker,
          price,
          sl: parseFloat((price * (1 - slPct / 100)).toFixed(2)),
          tp1: parseFloat((price * (1 + tp1Pct / 100)).toFixed(2)),
          tp2: parseFloat((price * (1 + tp2Pct / 100)).toFixed(2)),
          tp3: parseFloat((price * (1 + tp3Pct / 100)).toFixed(2)),
          secret: secretInput
        };
      }
      onSimulateWebhook(payload);
      onClose();
    } catch (err: any) {
      alert('Invalid JSON formatting: ' + err.message);
    }
  };

  const handleLoadPreset = (presetType: 'btc_success' | 'sol_success' | 'bad_secret' | 'inactive_coin') => {
    if (presetType === 'btc_success') {
      setRawJson(JSON.stringify({
        action: "buy",
        ticker: "BTCUSDT",
        price: 67500,
        sl: 65100,
        tp1: 69500,
        tp2: 71500,
        tp3: 74000,
        secret: webhookSecret
      }, null, 2));
      setMode('raw');
    } else if (presetType === 'sol_success') {
      setRawJson(JSON.stringify({
        action: "buy",
        ticker: "SOLUSDT",
        price: 188.50,
        sl: 178.00,
        tp1: 196.00,
        tp2: 205.00,
        tp3: 220.00,
        secret: webhookSecret
      }, null, 2));
      setMode('raw');
    } else if (presetType === 'bad_secret') {
      setRawJson(JSON.stringify({
        action: "buy",
        ticker: "ETHUSDT",
        price: 3400,
        sl: 3250,
        tp1: 3550,
        tp2: 3700,
        tp3: 3900,
        secret: "malicious_hacker_wrong_secret"
      }, null, 2));
      setMode('raw');
    } else if (presetType === 'inactive_coin') {
      setRawJson(JSON.stringify({
        action: "buy",
        ticker: "PEPEUSDT",
        price: 0.000012,
        sl: 0.000010,
        tp1: 0.000014,
        tp2: 0.000016,
        tp3: 0.000020,
        secret: webhookSecret
      }, null, 2));
      setMode('raw');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="relative max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-left space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-mono">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">TradingView Webhook Tester</h3>
              <p className="text-xs text-slate-400">Simulate JSON signals hitting POST <code className="text-cyan-300 font-mono">/api/webhook</code></p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode & Quick Presets */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setMode('guided')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === 'guided' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Interactive Wizard
            </button>
            <button
              onClick={() => setMode('raw')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === 'raw' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Raw TradingView JSON
            </button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto py-1">
            <span className="text-[11px] font-semibold text-slate-500 shrink-0">Demo Presets:</span>
            <button 
              onClick={() => handleLoadPreset('btc_success')}
              className="px-2.5 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/80 text-[11px] font-mono shrink-0 flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" /> BTC Breakout
            </button>
            <button 
              onClick={() => handleLoadPreset('sol_success')}
              className="px-2.5 py-1 rounded-lg bg-blue-950 hover:bg-blue-900 text-blue-300 border border-blue-800/80 text-[11px] font-mono shrink-0 flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" /> SOL Surge
            </button>
            <button 
              onClick={() => handleLoadPreset('bad_secret')}
              className="px-2.5 py-1 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800/80 text-[11px] font-mono shrink-0 flex items-center gap-1"
              title="Test dropping unauthenticated attacks"
            >
              <AlertTriangle className="w-3 h-3" /> Bad Secret Test
            </button>
            <button 
              onClick={() => handleLoadPreset('inactive_coin')}
              className="px-2.5 py-1 rounded-lg bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-800/80 text-[11px] font-mono shrink-0 flex items-center gap-1"
              title="Test firing an unapproved pair"
            >
              Inactive Coin
            </button>
          </div>
        </div>

        {/* Form Body */}
        {mode === 'guided' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Select Ticker Pair</label>
                <select
                  value={ticker}
                  onChange={(e) => handleGuidedTickerChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white text-sm font-mono focus:outline-none focus:border-cyan-500"
                >
                  {coins.map((c) => (
                    <option key={c.id} value={c.ticker}>
                      {c.ticker} {c.isActive ? '🟢 Active' : '🔴 Disabled'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Entry Spot Price (USDT)</label>
                <input
                  type="number"
                  step="any"
                  value={price}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setPrice(val);
                    updateGuidedValues(ticker, val);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white text-sm font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Webhook Validation Secret</label>
              <input
                type="text"
                value={secretInput}
                onChange={(e) => {
                  setSecretInput(e.target.value);
                  updateGuidedValues(ticker, price);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white text-sm font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Calculated Targets &amp; Trailing Tiers</span>
                <span className="text-emerald-400 lowercase font-mono">Auto split 33% / 33% / 34%</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs font-mono">
                <div className="bg-rose-950/40 p-2.5 rounded-xl border border-rose-800/50">
                  <div className="text-rose-400 text-[10px]">Initial SL</div>
                  <div className="text-white font-bold text-sm mt-0.5">
                    {parseFloat((price * (1 - (coins.find(c => c.ticker === ticker)?.defaultStopLossPct || 3.5) / 100)).toFixed(2))}
                  </div>
                </div>
                <div className="bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-800/50">
                  <div className="text-emerald-400 text-[10px]">TP1 (SL &rarr; Breakeven)</div>
                  <div className="text-white font-bold text-sm mt-0.5">
                    {parseFloat((price * (1 + (coins.find(c => c.ticker === ticker)?.defaultTp1Pct || 3.0) / 100)).toFixed(2))}
                  </div>
                </div>
                <div className="bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-800/50">
                  <div className="text-emerald-400 text-[10px]">TP2 (SL &rarr; TP1)</div>
                  <div className="text-white font-bold text-sm mt-0.5">
                    {parseFloat((price * (1 + (coins.find(c => c.ticker === ticker)?.defaultTp2Pct || 6.0) / 100)).toFixed(2))}
                  </div>
                </div>
                <div className="bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-800/50">
                  <div className="text-emerald-400 text-[10px]">TP3 (Final Close)</div>
                  <div className="text-white font-bold text-sm mt-0.5">
                    {parseFloat((price * (1 + (coins.find(c => c.ticker === ticker)?.defaultTp3Pct || 10.0) / 100)).toFixed(2))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Raw TradingView JSON Payload</span>
              <span className="text-[10px] text-cyan-400">Must match exactly specification format</span>
            </label>
            <textarea
              rows={11}
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-sm text-emerald-300 focus:outline-none focus:border-cyan-500 leading-relaxed"
            />
          </div>
        )}

        <div className="pt-2 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Simulates Express API webhook receiver <code className="text-slate-400 font-mono">POST /api/webhook</code>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 text-sm font-bold shadow-lg shadow-cyan-500/20 flex items-center gap-2 transition-all transform active:scale-95"
            >
              <Send className="w-4 h-4" />
              <span>Execute Webhook Alert</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
