import React, { useState } from 'react';
import { Bot, Mail, Lock, ShieldCheck, ArrowRight, Sparkles } from 'lucide-react';

interface LoginModalProps {
  onLoginSuccess: (email: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('changeme');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    setTimeout(() => {
      if (email === 'admin@example.com' && password === 'changeme') {
        setIsLoading(false);
        onLoginSuccess(email);
      } else {
        setIsLoading(false);
        setError('Invalid admin credentials. Use admin@example.com / changeme');
      }
    }, 600);
  };

  const handleDemoQuickLogin = () => {
    setEmail('admin@example.com');
    setPassword('changeme');
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onLoginSuccess('admin@example.com');
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" />
      </div>

      <div className="relative max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-left space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/25">
            <Bot className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Quantum Mind Console
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              8-Engine AI Trading · JARVIS Voice Agent
            </p>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 text-xs font-mono">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Single Admin Secure Gateway</span>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs text-center font-medium">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 ml-1">Admin Email</label>
            <div className="relative flex items-center">
              <Mail className="absolute left-4 w-4 h-4 text-slate-500 pointer-events-none" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@example.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between ml-1 mr-1">
              <label className="text-xs font-semibold text-slate-300">Admin Password</label>
              <span className="text-[10px] text-slate-500 font-mono">Default: changeme</span>
            </div>
            <div className="relative flex items-center">
              <Lock className="absolute left-4 w-4 h-4 text-slate-500 pointer-events-none" />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 flex items-center justify-center gap-2 py-3.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-xl text-sm shadow-xl shadow-cyan-500/20 transition-all transform active:scale-[0.99] disabled:opacity-50"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Authenticating Admin...</span>
              </span>
            ) : (
              <>
                <span>Launch Operational Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Quick Demo Assist */}
        <div className="pt-4 border-t border-slate-800/80 text-center">
          <button
            onClick={handleDemoQuickLogin}
            type="button"
            className="inline-flex items-center gap-2 text-xs font-medium text-cyan-400 hover:text-cyan-300 hover:underline transition-colors py-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Click to Use Live Demo Admin Profile</span>
          </button>
        </div>

        {/* Stack architecture hint */}
        <div className="text-[11px] text-slate-600 text-center font-mono leading-tight">
          Quantum Mind AI • Binance Spot Execution <br /> AES-256-GCM Encrypted Keys
        </div>
      </div>
    </div>
  );
};
