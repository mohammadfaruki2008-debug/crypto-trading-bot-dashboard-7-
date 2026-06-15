import { useState, useEffect, useRef, useMemo } from 'react';
import { LiveTicker, TradeableCoin } from '../types';

// Live Binance Spot prices.
// Symbols = active tradeable coins + any open-position symbols (so the
// dashboard Active Trades table always tracks real live prices).
// 1) Seeds REAL prices instantly via REST /api/v3/ticker/24hr
// 2) Streams live updates via the official combined WebSocket
// 3) Falls back to gentle simulation ONLY if both REST and WS fail

export function useLiveBinancePrices(coins: TradeableCoin[], extraSymbols: string[] = []) {
  const [tickers, setTickers] = useState<Record<string, LiveTicker>>({});
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionMode, setConnectionMode] = useState<'Binance Live WS' | 'Binance REST Poll' | 'Simulated Ticker Stream'>('Binance Live WS');

  const wsRef = useRef<WebSocket | null>(null);
  const wsAliveRef = useRef(false);
  const restOkRef = useRef(false);

  // Stable symbol key so the effect only re-runs when the set actually changes
  const symbolKey = useMemo(() => {
    const set = new Set<string>();
    coins.forEach(c => set.add(c.ticker.toUpperCase()));
    extraSymbols.forEach(s => set.add(s.toUpperCase()));
    return Array.from(set).sort().join(',');
  }, [coins, extraSymbols]);

  useEffect(() => {
    const symbols = symbolKey ? symbolKey.split(',') : [];
    if (symbols.length === 0) {
      setTickers({});
      return;
    }

    let mounted = true;
    wsAliveRef.current = false;
    restOkRef.current = false;

    // ── 1. REST seed + periodic poll (real prices, also our WS backup) ──
    const fetchRest = async () => {
      try {
        const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
        if (!res.ok) throw new Error('rest http ' + res.status);
        const data = await res.json();
        if (!mounted || !Array.isArray(data)) return;
        restOkRef.current = true;
        setTickers(prev => {
          const next = { ...prev };
          for (const t of data) {
            next[t.symbol] = {
              symbol: t.symbol,
              price: parseFloat(t.lastPrice),
              change24h: parseFloat(t.priceChangePercent),
              high24h: parseFloat(t.highPrice),
              low24h: parseFloat(t.lowPrice),
              volume: parseFloat(t.volume),
            };
          }
          return next;
        });
        if (!wsAliveRef.current) {
          setIsConnected(true);
          setConnectionMode('Binance REST Poll');
        }
      } catch {
        restOkRef.current = false;
      }
    };
    fetchRest();
    // Poll every 10s as backup; harmless while WS is alive (WS overwrites)
    const restTimer = setInterval(() => {
      if (!wsAliveRef.current) fetchRest();
    }, 10000);

    // ── 2. Live WebSocket combined ticker stream ──
    try {
      const streams = symbols.map(s => `${s.toLowerCase()}@ticker`).join('/');
      const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mounted) return;
        wsAliveRef.current = true;
        setIsConnected(true);
        setConnectionMode('Binance Live WS');
      };

      ws.onmessage = (event) => {
        if (!mounted) return;
        try {
          const msg = JSON.parse(event.data);
          const d = msg.data || msg; // combined stream wraps in {stream, data}
          const symbol = d.s;
          const price = parseFloat(d.c);
          if (!symbol || isNaN(price)) return;
          setTickers(prev => ({
            ...prev,
            [symbol]: {
              symbol,
              price,
              change24h: parseFloat(d.P),
              high24h: parseFloat(d.h),
              low24h: parseFloat(d.l),
              volume: parseFloat(d.v),
            },
          }));
        } catch { /* ignore parse errors */ }
      };

      ws.onerror = () => {
        wsAliveRef.current = false;
      };
      ws.onclose = () => {
        wsAliveRef.current = false;
        if (mounted && restOkRef.current) {
          setConnectionMode('Binance REST Poll');
        }
      };
    } catch {
      wsAliveRef.current = false;
    }

    // ── 3. Simulation ONLY when both WS and REST are unreachable ──
    const simTimer = setInterval(() => {
      if (wsAliveRef.current || restOkRef.current) return;
      if (!mounted) return;
      setConnectionMode('Simulated Ticker Stream');
      setIsConnected(true);
      setTickers(prev => {
        const next = { ...prev };
        for (const sym of symbols) {
          const cur = next[sym] || { symbol: sym, price: 100, change24h: 0, high24h: 100, low24h: 100, volume: 0 };
          const factor = 1 + (Math.random() * 0.006 - 0.003);
          const np = parseFloat((cur.price * factor).toFixed(cur.price < 5 ? 4 : 2));
          next[sym] = {
            ...cur,
            price: np,
            change24h: parseFloat((cur.change24h + ((np - cur.price) / cur.price) * 100).toFixed(2)),
            high24h: Math.max(cur.high24h, np),
            low24h: Math.min(cur.low24h, np),
          };
        }
        return next;
      });
    }, 2000);

    return () => {
      mounted = false;
      try { wsRef.current?.close(); } catch { /* ignore */ }
      wsRef.current = null;
      clearInterval(restTimer);
      clearInterval(simTimer);
    };
  }, [symbolKey]);

  return { tickers, isConnected, connectionMode };
}
