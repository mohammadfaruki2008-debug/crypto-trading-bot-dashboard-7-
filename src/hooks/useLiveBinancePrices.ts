import { useState, useEffect, useRef, useMemo } from 'react';
import { TradeableCoin } from '../types';

// Public price feed, no API keys required.
export function useLiveBinancePrices(coins: TradeableCoin[]) {
  const [tickers, setTickers] = useState<Record<string, any>>({});
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const symbolKey = useMemo(() => {
    return coins.map(c => c.ticker.toLowerCase()).sort().join(',');
  }, [coins]);

  useEffect(() => {
    const symbols = symbolKey ? symbolKey.split(',') : [];
    if (symbols.length === 0) return;

    const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${symbols.map(s => `${s}@ticker`).join('/')}`);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const d = msg.data;
        if (d && d.s) {
          setTickers(prev => ({ ...prev, [d.s]: { symbol: d.s, price: parseFloat(d.c), change24h: parseFloat(d.P) } }));
        }
      } catch {}
    };
    ws.onclose = () => setIsConnected(false);

    return () => ws.close();
  }, [symbolKey]);

  return { tickers, isConnected };
}
