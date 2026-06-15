import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 6000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div 
      className={`pointer-events-auto flex items-start p-4 rounded-xl shadow-xl backdrop-blur-md border transition-all duration-300 transform translate-y-0 opacity-100 ${
        toast.type === 'success' 
          ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-100 shadow-emerald-950/50' 
          : toast.type === 'error'
          ? 'bg-rose-950/90 border-rose-500/40 text-rose-100 shadow-rose-950/50'
          : 'bg-slate-900/90 border-slate-700 text-slate-100 shadow-slate-950/50'
      }`}
    >
      <div className="mr-3 mt-0.5 shrink-0">
        {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
        {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400" />}
        {toast.type === 'info' && <Info className="w-5 h-5 text-sky-400" />}
      </div>
      <div className="flex-1 mr-2">
        <h4 className="text-sm font-semibold tracking-wide">{toast.title}</h4>
        <p className="text-xs mt-1 leading-relaxed opacity-90">{toast.message}</p>
      </div>
      <button 
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 p-1 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
