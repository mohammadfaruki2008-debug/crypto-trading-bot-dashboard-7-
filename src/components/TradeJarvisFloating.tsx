import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, Send, X, Bot, Loader2, Zap, ShieldAlert,
  TrendingUp, TrendingDown, Radio, Trash2, Terminal,
  FileCode2, CheckCircle2, AlertTriangle, Mic, MicOff, Volume2
} from 'lucide-react';
import { askJarvis, JarvisContext, ExecutedAction } from '../lib/jarvisBrain';

/* ═══════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════ */

interface TradeJarvisFloatingProps {
  context: JarvisContext;
  /** Optional: if your Express server is running, set this to e.g. "http://localhost:8080".
   *  When set, Jarvis calls POST /api/jarvis on the server instead of the local brain. */
  serverUrl?: string;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'jarvis';
  text: string;
  actions?: ExecutedAction[];
  ts: number;
}

/* ═══════════════════════════════════════════════════════════════════
   Web Speech API type shims (not in all TS libs)
   ═══════════════════════════════════════════════════════════════════ */

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}
interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

function getSpeechRecognition(): (new () => ISpeechRecognition) | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/* ═══════════════════════════════════════════════════════════════════
   Lightweight markdown renderer
   ═══════════════════════════════════════════════════════════════════ */

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts = text.split(regex).filter(Boolean);
  parts.forEach((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) nodes.push(<strong key={i} className="font-bold text-white">{p.slice(2, -2)}</strong>);
    else if (/^\*[^*]+\*$/.test(p)) nodes.push(<em key={i} className="text-slate-300">{p.slice(1, -1)}</em>);
    else if (/^`[^`]+`$/.test(p)) nodes.push(<code key={i} className="bg-slate-800 text-cyan-300 px-1.5 py-0.5 rounded font-mono text-[11px]">{p.slice(1, -1)}</code>);
    else nodes.push(<span key={i}>{p}</span>);
  });
  return nodes;
}

function Markdown({ content }: { content: string }) {
  const blocks = content.split(/```/);
  return (
    <div className="space-y-1.5">
      {blocks.map((block, i) => {
        if (i % 2 === 1) {
          const lines = block.replace(/^\w*\n/, '').replace(/\n$/, '').split('\n');
          return (
            <pre key={i} className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 overflow-x-auto">
              <code className="text-[10.5px] font-mono text-emerald-300 leading-relaxed whitespace-pre">{lines.join('\n')}</code>
            </pre>
          );
        }
        return (
          <React.Fragment key={i}>
            {block.split('\n').map((line, j) => {
              if (!line.trim()) return <div key={j} className="h-1.5" />;
              const isBullet = /^\s*[-*]\s+/.test(line);
              const lineContent = isBullet ? line.replace(/^\s*[-*]\s+/, '') : line;
              return (
                <div key={j} className={`text-[12.5px] leading-relaxed ${isBullet ? 'flex gap-1.5 pl-1' : ''}`}>
                  {isBullet && <span className="text-cyan-400 mt-0.5">›</span>}
                  <span className="text-slate-200">{renderInline(lineContent)}</span>
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Action card renderer (trade, code fix, generic)
   ═══════════════════════════════════════════════════════════════════ */

function ActionCard({ action, onConfirmCode }: { action: ExecutedAction; onConfirmCode: (path: string) => void }) {
  if (action.action === 'place_order') {
    const p = action.params;
    const isBuy = String(p.side || 'buy') !== 'sell';
    const sym = String(p.symbol || '');
    return (
      <div className={`rounded-xl border overflow-hidden ${isBuy ? 'border-emerald-600/50 bg-emerald-950/30' : 'border-rose-600/50 bg-rose-950/30'}`}>
        <div className={`px-3 py-1.5 flex items-center justify-between ${isBuy ? 'bg-emerald-600/30' : 'bg-rose-600/30'}`}>
          <span className="flex items-center gap-1.5 text-xs font-bold text-white">
            {isBuy ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {isBuy ? 'BUY' : 'SELL'} {sym}
          </span>
          <span className={`text-[9px] font-mono font-bold ${action.result.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
            {action.result.ok ? '✓ EXECUTED' : '✗ FAILED'}
          </span>
        </div>
        <div className="px-3 py-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px] font-mono">
          {p.quote_usdt != null && <span className="text-slate-400">Size: <b className="text-white">{String(p.quote_usdt)} USDT</b></span>}
          {p.sl != null && <span className="text-slate-400">SL: <b className="text-rose-400">{Number(p.sl).toLocaleString()}</b></span>}
          {p.tp1 != null && <span className="text-slate-400">TP1: <b className="text-emerald-400">{Number(p.tp1).toLocaleString()}</b></span>}
          {p.tp2 != null && <span className="text-slate-400">TP2: <b className="text-emerald-400">{Number(p.tp2).toLocaleString()}</b></span>}
          {p.tp3 != null && <span className="text-slate-400">TP3: <b className="text-emerald-400">{Number(p.tp3).toLocaleString()}</b></span>}
        </div>
      </div>
    );
  }

  if (action.action === 'modify_code') {
    const p = action.params;
    const path = String(p.path || 'src/custom.tsx');
    const code = String(p.code || '');
    const reasoning = String(p.reasoning || '');
    return (
      <div className="rounded-2xl border border-purple-500/60 bg-purple-950/20 overflow-hidden shadow-xl shadow-purple-950/40 mt-1">
        <div className="px-3.5 py-2 bg-gradient-to-r from-purple-900/60 to-purple-800/30 border-b border-purple-500/30 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-bold text-white">
            <FileCode2 className="w-4 h-4 text-purple-400" /> CODE INJECTION
          </span>
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[8.5px] font-mono font-bold flex items-center gap-1 animate-pulse">
            <AlertTriangle className="w-2.5 h-2.5" /> CONFIRM
          </span>
        </div>
        <div className="p-3.5 space-y-2.5">
          <div className="text-[11px] font-mono text-slate-300 flex justify-between">
            <span className="text-slate-400">Path:</span>
            <code className="bg-slate-900 px-2 py-0.5 rounded text-purple-300 border border-slate-800 font-bold">{path}</code>
          </div>
          {reasoning && <p className="text-[11px] text-slate-300 bg-slate-900/50 p-2 rounded-xl border border-slate-800"><b className="text-purple-400">Reason:</b> {reasoning}</p>}
          <pre className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 max-h-32 overflow-y-auto">
            <code className="text-[10px] font-mono text-cyan-300 whitespace-pre">{code}</code>
          </pre>
          <button type="button" onClick={() => onConfirmCode(path)}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-purple-600/30 active:scale-95">
            <CheckCircle2 className="w-4 h-4" /> Approve &amp; Apply
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2">
      <div className="flex items-center gap-1.5 mb-0.5">
        <Terminal className="w-3 h-3 text-cyan-400" />
        <span className="text-[10px] font-mono font-bold text-cyan-300 uppercase">{action.action}</span>
        <span className={`text-[9px] font-mono ml-auto ${action.result.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{action.result.ok ? '✓' : '✗'}</span>
      </div>
      <p className="text-[11px] text-slate-400 leading-snug">{action.result.message}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TTS helper — speak text aloud, returns a promise
   ═══════════════════════════════════════════════════════════════════ */

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) { resolve(); return; }
    window.speechSynthesis.cancel();
    // Strip markdown for cleaner speech
    const clean = text.replace(/\*\*/g, '').replace(/`[^`]+`/g, '').replace(/```[\s\S]*?```/g, '').replace(/[#>*_~]/g, '').trim();
    if (!clean) { resolve(); return; }
    // Trim to ~300 chars for natural speech
    const trimmed = clean.length > 300 ? clean.slice(0, 300) + '...' : clean;
    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.rate = 1.05;
    utterance.pitch = 0.95;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

export const TradeJarvisFloating: React.FC<TradeJarvisFloatingProps> = ({ context, serverUrl }) => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([{
    id: 'intro', role: 'jarvis', ts: Date.now(),
    text: "Good day, sir. **JARVIS** online — voice and text. I control the entire Quantum Mind dashboard. Click the 🎤 or just type. How may I assist?",
  }]);
  const [logs, setLogs] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Voice state ──
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [voiceError, setVoiceError] = useState('');
  const [interim, setInterim] = useState(''); // live transcript while speaking
  const [isSpeaking, setIsSpeaking] = useState(false); // TTS playing
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const voiceOnRef = useRef(false); // avoids stale closure in callbacks
  const busyRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);
  useEffect(() => { busyRef.current = busy; }, [busy]);

  const ctx: JarvisContext = {
    ...context,
    onLog: (msg) => setLogs((prev) => [msg, ...prev].slice(0, 8)),
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, interim]);

  // ── Core send function (used by both text input and voice) ──
  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busyRef.current) return;

    const userMsg: ChatMsg = { id: `u_${Date.now()}`, role: 'user', text: trimmed, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setInterim('');
    setBusy(true);

    try {
      let reply: { text: string; actions: ExecutedAction[] };

      if (serverUrl) {
        // Call real Express server
        const res = await fetch(`${serverUrl}/api/jarvis`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed }),
        });
        const data = await res.json();
        reply = { text: data.reply || data.error || 'No response', actions: data.actions || [] };
      } else {
        // Local browser brain
        const r = await askJarvis(trimmed, ctx);
        reply = { text: r.text, actions: r.actions };
      }

      const jarvisMsg: ChatMsg = {
        id: `j_${Date.now()}`, role: 'jarvis', text: reply.text,
        actions: reply.actions, ts: Date.now(),
      };
      setMessages((prev) => [...prev, jarvisMsg]);

      // TTS — speak the response if voice mode is on
      if (voiceOnRef.current && reply.text) {
        setIsSpeaking(true);
        await speak(reply.text);
        setIsSpeaking(false);
        // Resume mic after speaking (continuous mode)
        if (voiceOnRef.current) startRecognition();
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, {
        id: `j_${Date.now()}`, role: 'jarvis', ts: Date.now(),
        text: `Apologies, sir — error: ${err.message}`,
      }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [context, serverUrl]);

  // ── Speech Recognition ──
  const startRecognition = useCallback(() => {
    const SRClass = getSpeechRecognition();
    if (!SRClass) { setVoiceSupported(false); setVoiceError('Speech Recognition not supported in this browser'); return; }

    // Stop any existing instance
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ok */ }
    }

    const recognition = new SRClass();
    recognition.continuous = false; // we restart after each result for reliability
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (interimTranscript) setInterim(interimTranscript);

      if (finalTranscript.trim()) {
        setInterim('');
        // Don't send while busy or speaking
        if (!busyRef.current) {
          send(finalTranscript.trim());
        }
      }
    };

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setVoiceError('Microphone permission denied. Please allow mic access and try again.');
        setVoiceOn(false);
        return;
      }
      if (e.error === 'no-speech') {
        // No speech detected — restart if still active
        if (voiceOnRef.current && !busyRef.current) {
          setTimeout(() => { if (voiceOnRef.current) startRecognition(); }, 500);
        }
        return;
      }
      if (e.error === 'aborted') return; // user-initiated stop
      console.warn('[JARVIS VOICE]', e.error, e.message);
    };

    recognition.onend = () => {
      setInterim('');
      // Auto-restart if voice mode is still on and not busy/speaking
      if (voiceOnRef.current && !busyRef.current) {
        setTimeout(() => {
          if (voiceOnRef.current && !busyRef.current) startRecognition();
        }, 300);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err: any) {
      setVoiceError('Failed to start: ' + err.message);
      setVoiceOn(false);
    }
  }, [send]);

  const toggleVoice = useCallback(() => {
    if (!voiceSupported && !getSpeechRecognition()) {
      setVoiceError('Speech Recognition not supported in this browser. Use Chrome or Edge.');
      return;
    }
    setVoiceError('');

    if (voiceOn) {
      // Turn off
      setVoiceOn(false);
      setInterim('');
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ok */ }
        recognitionRef.current = null;
      }
      window.speechSynthesis?.cancel();
      setIsSpeaking(false);
    } else {
      // Turn on
      setVoiceOn(true);
      setVoiceSupported(true);
      startRecognition();
    }
  }, [voiceOn, voiceSupported, startRecognition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) try { recognitionRef.current.abort(); } catch { /* ok */ }
      window.speechSynthesis?.cancel();
    };
  }, []);

  const quickActions = [
    { label: 'Scan markets', icon: Radio, msg: 'Scan the markets and find trading opportunities' },
    { label: 'Portfolio', icon: Bot, msg: 'Show my portfolio and open positions' },
    { label: 'Emergency stop', icon: ShieldAlert, msg: 'Emergency stop — close everything now' },
  ];

  return (
    <>
      {/* ── Floating button ── */}
      {!open && (
        <button onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 200); }}
          className="fixed bottom-5 right-5 z-50 group" aria-label="Open JARVIS">
          <span className="absolute inset-0 rounded-full bg-cyan-500/40 animate-ping" />
          <span className="absolute inset-0 rounded-full bg-cyan-500/20 blur-md animate-pulse" />
          <span className="relative w-16 h-16 rounded-full bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-cyan-500/40 border-2 border-cyan-300/50 group-hover:scale-105 transition-transform">
            <div className="absolute inset-1.5 rounded-full border border-cyan-200/40 animate-spin" style={{ animationDuration: '8s' }} />
            <Sparkles className="w-7 h-7 text-white relative drop-shadow" />
          </span>
          <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[8px] font-bold border border-white/20">AI</span>
        </button>
      )}

      {/* ── Chat window ── */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[calc(100vw-2.5rem)] sm:w-[420px] h-[640px] max-h-[calc(100vh-2.5rem)] flex flex-col bg-slate-950/95 backdrop-blur-xl rounded-3xl border border-cyan-500/30 shadow-2xl shadow-cyan-950/50 overflow-hidden">

          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-cyan-600/20 via-blue-600/15 to-transparent border-b border-cyan-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-slate-950" />
              </div>
              <div>
                <div className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                  JARVIS
                  <span className="text-[8px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">ONLINE</span>
                  {voiceOn && <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono animate-pulse">🎤 LISTENING</span>}
                  {isSpeaking && <Volume2 className="w-3 h-3 text-amber-400 animate-pulse" />}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">Autonomous Agent • Voice &amp; Text</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMessages([messages[0]])} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300" title="Clear chat">
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%]`}>
                  {m.role === 'jarvis' && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      <span className="text-[9px] font-mono font-bold text-cyan-400 uppercase tracking-wider">Jarvis</span>
                    </div>
                  )}
                  <div className={`rounded-2xl px-3.5 py-2.5 ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-slate-900/80 border border-slate-800 text-slate-200 rounded-bl-sm'
                  }`}>
                    {m.role === 'user' ? (
                      <p className="text-[12.5px] leading-relaxed">{m.text}</p>
                    ) : (
                      <Markdown content={m.text} />
                    )}
                  </div>
                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {m.actions.map((a, i) => (
                        <ActionCard key={i} action={a}
                          onConfirmCode={(path) => send(`Security confirmation authorized for code injection into ${path}. Apply now.`)} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Live voice transcript (interim) */}
            {interim && (
              <div className="flex justify-end">
                <div className="bg-blue-600/40 border border-blue-500/30 text-blue-200 rounded-2xl rounded-br-sm px-3.5 py-2 max-w-[85%]">
                  <p className="text-[12.5px] leading-relaxed italic flex items-center gap-2">
                    <Mic className="w-3 h-3 text-blue-300 animate-pulse shrink-0" />
                    {interim}
                    <span className="text-blue-400 animate-pulse">|</span>
                  </p>
                </div>
              </div>
            )}

            {busy && (
              <div className="flex justify-start">
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                  <span className="text-[11px] text-slate-400 font-mono">processing...</span>
                  <span className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Tool logs */}
          {logs.length > 0 && (
            <div className="px-3.5 py-1.5 border-t border-slate-800/60 bg-slate-950/60 max-h-14 overflow-y-auto">
              {logs.slice(0, 2).map((l, i) => (
                <div key={i} className="text-[9.5px] font-mono text-slate-500 truncate">{l}</div>
              ))}
            </div>
          )}

          {/* Voice error */}
          {voiceError && (
            <div className="px-3.5 py-2 bg-rose-950/40 border-t border-rose-500/30 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-[10.5px] text-rose-300 leading-snug">{voiceError}</p>
              <button onClick={() => setVoiceError('')} className="text-rose-500 hover:text-rose-300 shrink-0 ml-auto"><X className="w-3 h-3" /></button>
            </div>
          )}

          {/* Quick actions (only on first view) */}
          {messages.length <= 1 && (
            <div className="px-3.5 pb-2 flex flex-wrap gap-1.5">
              {quickActions.map((qa) => (
                <button key={qa.label} onClick={() => send(qa.msg)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10.5px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <qa.icon className="w-3 h-3 text-cyan-400" /> {qa.label}
                </button>
              ))}
            </div>
          )}

          {/* Input bar + voice toggle */}
          <div className="p-3 border-t border-slate-800/60 bg-slate-950/60">
            <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2">
              {/* 🎤 Voice toggle */}
              <button
                type="button"
                onClick={toggleVoice}
                disabled={busy || isSpeaking}
                title={voiceOn ? 'Turn off voice (listening)' : 'Turn on voice control'}
                className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition-all relative disabled:opacity-40 ${
                  voiceOn
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {/* Pulse ring when listening */}
                {voiceOn && (
                  <>
                    <span className="absolute inset-0 rounded-xl bg-emerald-400/30 animate-ping" />
                    <span className="absolute inset-0 rounded-xl border-2 border-emerald-400/60 animate-pulse" />
                  </>
                )}
                {voiceOn ? <Mic className="w-4.5 h-4.5 relative" /> : <MicOff className="w-4.5 h-4.5" />}
              </button>

              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={voiceOn ? 'Listening... (or type here)' : 'Ask JARVIS anything...'}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl py-2.5 px-3.5 text-[12.5px] text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
              />

              <button type="submit" disabled={busy || !input.trim()}
                className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white flex items-center justify-center shadow-lg shadow-cyan-500/30 disabled:opacity-40 active:scale-95">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>

            <div className="text-[9px] text-slate-600 font-mono text-center mt-1.5 flex items-center justify-center gap-1.5">
              <Zap className="w-2.5 h-2.5" />
              {serverUrl ? 'Connected to Express server' : 'Cloudflare Worker · Multi-AI'}
              {voiceOn && <span className="text-emerald-400">• Voice active</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
