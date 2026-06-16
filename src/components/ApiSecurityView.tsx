import React, { useState } from 'react';
import { Key, ShieldCheck, Server, Eye, EyeOff, Save, Mail, Zap, Check } from 'lucide-react';
import { BinanceSettings, AlertSettings } from '../types';
import { backendApi as api } from '../lib/backendApi';

interface ApiSecurityViewProps {
  binanceSettings: BinanceSettings;
  alertSettings: AlertSettings;
  testnetMode?: boolean;
  onSaveBinanceSettings: (newSettings: BinanceSettings) => void;
  onSaveAlertSettings: (newSettings: AlertSettings) => void;
  onOpenIpModal: () => void;
}

const SignalToggleSwitch: React.FC<{ enabled: boolean; onToggle: () => void; accent?: 'amber' | 'purple' }> = ({ enabled, onToggle, accent = 'amber' }) => {
  const accentBg = accent === 'amber' ? 'bg-amber-500 shadow-amber-500/40' : 'bg-purple-500 shadow-purple-500/40';
  return (
    <button type="button" onClick={onToggle} className={`relative shrink-0 w-12 h-7 rounded-full transition-all duration-300 border ${enabled ? `${accentBg} border-transparent shadow-lg` : 'bg-slate-800 border-slate-700'}`} role="switch" aria-checked={enabled}>
      <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-300 flex items-center justify-center ${enabled ? 'translate-x-5' : 'translate-x-0'}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      </span>
    </button>
  );
};

export const ApiSecurityView: React.FC<ApiSecurityViewProps> = ({ binanceSettings, alertSettings, testnetMode, onSaveBinanceSettings, onSaveAlertSettings, onOpenIpModal }) => {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [webhookSecret, setWebhookSecret] = useState(alertSettings.webhookSecret);
  const [imapEnabled, setImapEnabled] = useState(alertSettings.imapEnabled);
  const [emailAccount, setEmailAccount] = useState(alertSettings.emailAccount || '');
  const [emailPassword, setEmailPassword] = useState(alertSettings.emailPassword || '');

  const handleSaveBinance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey || !apiSecret) { alert('Please enter both API Key and Secret.'); return; }
    setIsSaving(true);
    try {
      const result = await api.saveApiKeys(apiKey, apiSecret, !!testnetMode);
      if (result.success) {
        onSaveBinanceSettings({ ...binanceSettings, apiKey: '••••••••', apiSecret: '••••••••', isEncrypted: true });
        setApiKey(''); setApiSecret('');
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert(`Error: ${result.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      alert(`Network error: ${error.message}`);
    } finally { setIsSaving(false); }
  };

  const handleSaveAlerts = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveAlertSettings({ ...alertSettings, webhookSecret, imapEnabled, emailAccount, emailPassword });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 text-left">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-700 flex items-center justify-center text-white font-bold shadow-lg shadow-emerald-500/20"><ShieldCheck className="w-5 h-5" /></div>
          <div><h2 className="text-xl font-bold text-white tracking-tight">Binance API &amp; Security</h2><p className="text-xs text-slate-400">Keys are encrypted (AES-256-GCM) and saved securely to the backend server</p></div>
        </div>
        <button onClick={onOpenIpModal} className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold text-xs flex items-center gap-2 border border-slate-700 transition-colors"><Server className="w-4 h-4 text-cyan-400" /><span>Server Whitelist IP</span></button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5"><Key className="w-5 h-5 text-cyan-400" /><h3 className="text-lg font-bold text-white">Binance Spot API Credentials {testnetMode && <span className="ml-2 text-[10px] font-mono text-amber-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-800">🧪 TESTNET</span>}</h3></div>
          {binanceSettings.isEncrypted && <span className="px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-400 text-xs font-mono font-bold border border-emerald-800/80"><ShieldCheck className="w-3.5 h-3.5 inline mr-1" />Saved &amp; Encrypted</span>}
        </div>
        <form onSubmit={handleSaveBinance} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">API Key</label>
            <input type="text" required value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste your Binance API Key" className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-sm text-cyan-300 font-mono focus:outline-none focus:border-cyan-500" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between"><label className="text-xs font-semibold text-slate-300">API Secret</label><button type="button" onClick={() => setShowSecret(!showSecret)} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">{showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}{showSecret ? 'Hide' : 'Reveal'}</button></div>
            <input type={showSecret ? 'text' : 'password'} required value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="Paste your API Secret" className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-sm text-emerald-300 font-mono focus:outline-none focus:border-cyan-500" />
            <p className="text-[10px] text-slate-500">Keys are encrypted with AES-256-GCM before saving to the server database.</p>
          </div>
          <button type="submit" disabled={isSaving} className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm shadow-xl shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50">
            {isSaving ? (
              <><span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" /><span>Encrypting and Saving...</span></>
            ) : saveSuccess ? (
              <><Check className="w-4 h-4" /><span>Encrypted and Saved!</span></>
            ) : (
              <><Save className="w-4 h-4" /><span>Encrypt and Save to Server</span></>
            )}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5"><Zap className="w-5 h-5 text-amber-400" /><h3 className="text-base font-bold text-white">TradingView Webhook</h3><span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">FUTURE-READY</span></div>
            <SignalToggleSwitch enabled={alertSettings.webhookEnabled !== false} onToggle={() => onSaveAlertSettings({ ...alertSettings, webhookEnabled: !(alertSettings.webhookEnabled !== false) })} accent="amber" />
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">Webhook alerts are handled by the backend server 24/7. Toggle ON when ready to connect TradingView.</p>
          <div className="space-y-1.5"><label className="text-xs font-semibold text-slate-300">Webhook Secret</label><input type="text" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 font-mono text-sm text-amber-300 font-bold focus:outline-none focus:border-amber-500" /></div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5"><Mail className="w-5 h-5 text-purple-400" /><h3 className="text-base font-bold text-white">Gmail IMAP</h3><span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">FUTURE-READY</span></div>
            <SignalToggleSwitch enabled={imapEnabled} onToggle={() => { const n = !imapEnabled; setImapEnabled(n); onSaveAlertSettings({ ...alertSettings, imapEnabled: n }); }} accent="purple" />
          </div>
          {imapEnabled ? (
            <form onSubmit={handleSaveAlerts} className="space-y-4">
              <input type="email" required value={emailAccount} onChange={(e) => setEmailAccount(e.target.value)} placeholder="alert-bot@gmail.com" className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-sm text-white font-mono focus:outline-none focus:border-purple-500" />
              <input type="password" required value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} placeholder="16-digit App Password" className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-sm text-purple-300 font-mono focus:outline-none focus:border-purple-500" />
              <button type="submit" className="w-full py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm">Save IMAP Config</button>
            </form>
          ) : <p className="text-xs text-slate-500">IMAP scraping OFF. Backend handles email alerts when enabled.</p>}
        </div>
      </div>
    </div>
  );
};
