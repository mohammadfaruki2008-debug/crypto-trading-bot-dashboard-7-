import React, { useMemo, useState } from 'react';
import { QuadChartSeries, QuadAnalysis } from '../lib/quadEngine';

interface QuadChartProps {
  series: QuadChartSeries;
  analysis: QuadAnalysis | null;
  symbol: string;
  intervalLabel: string;
}

const W = 1100;
const H = 520;
const PAD_TOP = 24;
const PAD_BOTTOM = 28;
const PAD_LEFT = 8;
const PAD_RIGHT = 92; // room for price labels + TP/SL tags
const VISIBLE_BARS = 120;

export const QuadChart: React.FC<QuadChartProps> = ({ series, analysis, symbol, intervalLabel }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const view = useMemo(() => {
    const total = series.candles.length;
    const start = Math.max(0, total - VISIBLE_BARS);
    const candles = series.candles.slice(start);
    const stLine = series.stLine.slice(start);
    const trend = series.trend.slice(start);
    const markers = series.markers
      .filter(m => m.index >= start)
      .map(m => ({ ...m, index: m.index - start }));

    // Price range — include indicator levels so TP/SL lines fit
    let min = Infinity, max = -Infinity;
    candles.forEach(c => { min = Math.min(min, c.low); max = Math.max(max, c.high); });
    stLine.forEach(v => { if (v > 0) { min = Math.min(min, v); max = Math.max(max, v); } });
    if (analysis?.comboBuy) {
      min = Math.min(min, analysis.sl);
      max = Math.max(max, analysis.tp3);
    }
    const pad = (max - min) * 0.04 || 1;
    min -= pad; max += pad;

    return { candles, stLine, trend, markers, min, max };
  }, [series, analysis]);

  const n = view.candles.length;
  if (n === 0) return null;

  const plotW = W - PAD_LEFT - PAD_RIGHT;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const step = plotW / n;
  const bodyW = Math.max(2, step * 0.62);

  const x = (i: number) => PAD_LEFT + i * step + step / 2;
  const y = (price: number) => PAD_TOP + plotH * (1 - (price - view.min) / (view.max - view.min));

  const fmt = (v: number) => v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v >= 5 ? v.toFixed(2) : v.toFixed(4);

  // Build SuperTrend path segments (split on trend change for coloring)
  const stSegments: { d: string; bull: boolean }[] = [];
  let curD = '';
  let curBull = view.trend[0] === 1;
  for (let i = 0; i < n; i++) {
    const px = x(i), py = y(view.stLine[i]);
    const bull = view.trend[i] === 1;
    if (bull !== curBull && curD) {
      stSegments.push({ d: curD, bull: curBull });
      curD = `M ${px} ${py}`;
      curBull = bull;
    } else {
      curD += curD === '' ? `M ${px} ${py}` : ` L ${px} ${py}`;
    }
  }
  if (curD) stSegments.push({ d: curD, bull: curBull });

  // Grid lines (5 levels)
  const gridLevels = Array.from({ length: 5 }, (_, i) => view.min + ((view.max - view.min) * (i + 0.5)) / 5);

  const lastClose = view.candles[n - 1].close;
  const hover = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < n ? view.candles[hoverIdx] : null;

  return (
    <div className="relative bg-[#0d1117] rounded-b-3xl overflow-hidden select-none">
      {/* Chart legend — like TradingView indicator legend */}
      <div className="absolute top-2.5 left-3 z-10 flex flex-col gap-1 pointer-events-none">
        <div className="text-[11px] font-mono text-slate-300 font-bold">
          {symbol} · {intervalLabel} · Binance
        </div>
        <div className="text-[10px] font-mono text-slate-500 flex items-center gap-2">
          <span className="text-purple-400 font-bold">QUAD v1.0</span>
          <span className={view.trend[n - 1] === 1 ? 'text-emerald-400' : 'text-rose-400'}>
            SATS {view.trend[n - 1] === 1 ? 'Bullish ▲' : 'Bearish ▼'}
          </span>
          {analysis && (
            <span className={analysis.lorePrediction > 0 ? 'text-emerald-400' : analysis.lorePrediction < 0 ? 'text-rose-400' : 'text-slate-500'}>
              Lore {analysis.lorePrediction > 0 ? '+' : ''}{analysis.lorePrediction}
            </span>
          )}
          {analysis && <span className="text-amber-400">TQI {analysis.tqi.toFixed(2)}</span>}
        </div>
        {hover && (
          <div className="text-[10px] font-mono text-slate-400">
            O <span className="text-slate-200">{fmt(hover.open)}</span>{' '}
            H <span className="text-slate-200">{fmt(hover.high)}</span>{' '}
            L <span className="text-slate-200">{fmt(hover.low)}</span>{' '}
            C <span className={hover.close >= hover.open ? 'text-emerald-400' : 'text-rose-400'}>{fmt(hover.close)}</span>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: '520px' }}
        onMouseMove={(e) => {
          const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * W;
          const idx = Math.floor((relX - PAD_LEFT) / step);
          setHoverIdx(idx >= 0 && idx < n ? idx : null);
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Grid */}
        {gridLevels.map((lvl, i) => (
          <g key={i}>
            <line x1={PAD_LEFT} y1={y(lvl)} x2={W - PAD_RIGHT} y2={y(lvl)} stroke="#1c2333" strokeWidth="1" strokeDasharray="3 5" />
            <text x={W - PAD_RIGHT + 6} y={y(lvl) + 3.5} fill="#4b5563" fontSize="11" fontFamily="monospace">{fmt(lvl)}</text>
          </g>
        ))}

        {/* Trend background tint */}
        {view.trend.map((t, i) => {
          // only draw tint blocks at trend boundaries for performance
          if (i > 0 && view.trend[i - 1] === t) return null;
          let end = i;
          while (end < n - 1 && view.trend[end + 1] === t) end++;
          return (
            <rect
              key={`bg${i}`}
              x={PAD_LEFT + i * step}
              y={PAD_TOP}
              width={(end - i + 1) * step}
              height={plotH}
              fill={t === 1 ? '#00E676' : '#FF5252'}
              opacity="0.035"
            />
          );
        })}

        {/* Candles */}
        {view.candles.map((c, i) => {
          const up = c.close >= c.open;
          const col = up ? '#26a69a' : '#ef5350';
          const bx = x(i);
          return (
            <g key={i} opacity={hoverIdx === null || hoverIdx === i ? 1 : 0.75}>
              <line x1={bx} y1={y(c.high)} x2={bx} y2={y(c.low)} stroke={col} strokeWidth="1" />
              <rect
                x={bx - bodyW / 2}
                y={y(Math.max(c.open, c.close))}
                width={bodyW}
                height={Math.max(1, Math.abs(y(c.open) - y(c.close)))}
                fill={col}
              />
            </g>
          );
        })}

        {/* SuperTrend line (the indicator!) */}
        {stSegments.map((seg, i) => (
          <path key={i} d={seg.d} fill="none" stroke={seg.bull ? '#00E676' : '#FF5252'} strokeWidth="2.5" strokeLinejoin="round" />
        ))}

        {/* BUY/SELL markers — like Pine labels */}
        {view.markers.map((m, i) => {
          const mx = x(m.index);
          if (m.type === 'buy') {
            const my = y(view.candles[m.index].low) + 14;
            return (
              <g key={i}>
                <polygon points={`${mx},${my - 8} ${mx - 6},${my + 2} ${mx + 6},${my + 2}`} fill="#00E676" />
                <rect x={mx - 30} y={my + 4} width="60" height="16" rx="4" fill="#00E676" />
                <text x={mx} y={my + 15.5} textAnchor="middle" fill="#04130a" fontSize="10" fontWeight="700" fontFamily="monospace">▲ BUY</text>
              </g>
            );
          }
          const my = y(view.candles[m.index].high) - 14;
          return (
            <g key={i}>
              <polygon points={`${mx},${my + 8} ${mx - 6},${my - 2} ${mx + 6},${my - 2}`} fill="#FF5252" />
              <rect x={mx - 32} y={my - 20} width="64" height="16" rx="4" fill="#FF5252" />
              <text x={mx} y={my - 8.5} textAnchor="middle" fill="#1a0505" fontSize="10" fontWeight="700" fontFamily="monospace">▼ SELL</text>
            </g>
          );
        })}

        {/* Active trade plan lines (Entry / SL / TP1-3) when combo buy */}
        {analysis?.comboBuy && (
          <>
            {[
              { v: analysis.entry, label: `ENTRY ${fmt(analysis.entry)}`, color: '#9ca3af', dash: '0' },
              { v: analysis.sl, label: `SL ${fmt(analysis.sl)}`, color: '#FF1744', dash: '0' },
              { v: analysis.tp1, label: `TP1 ${fmt(analysis.tp1)}`, color: '#00E676', dash: '6 4' },
              { v: analysis.tp2, label: `TP2 ${fmt(analysis.tp2)}`, color: '#00E676', dash: '6 4' },
              { v: analysis.tp3, label: `TP3 ${fmt(analysis.tp3)}`, color: '#00E676', dash: '6 4' },
            ].map((ln, i) => (
              <g key={`tl${i}`}>
                <line
                  x1={PAD_LEFT + plotW * 0.55}
                  y1={y(ln.v)}
                  x2={W - PAD_RIGHT}
                  y2={y(ln.v)}
                  stroke={ln.color}
                  strokeWidth={i === 1 || i === 0 ? 2 : 1.5}
                  strokeDasharray={ln.dash}
                />
                <rect x={W - PAD_RIGHT + 2} y={y(ln.v) - 8} width="86" height="16" rx="3" fill={ln.color} opacity="0.92" />
                <text x={W - PAD_RIGHT + 45} y={y(ln.v) + 3.5} textAnchor="middle" fill="#0b0f14" fontSize="9.5" fontWeight="700" fontFamily="monospace">
                  {ln.label}
                </text>
              </g>
            ))}
          </>
        )}

        {/* Last price line */}
        <line x1={PAD_LEFT} y1={y(lastClose)} x2={W - PAD_RIGHT} y2={y(lastClose)} stroke="#22d3ee" strokeWidth="1" strokeDasharray="2 3" opacity="0.7" />
        <rect x={W - PAD_RIGHT + 2} y={y(lastClose) - 9} width="86" height="18" rx="3" fill="#22d3ee" />
        <text x={W - PAD_RIGHT + 45} y={y(lastClose) + 4} textAnchor="middle" fill="#04222a" fontSize="10.5" fontWeight="700" fontFamily="monospace">
          {fmt(lastClose)}
        </text>

        {/* Hover crosshair */}
        {hoverIdx !== null && hoverIdx < n && (
          <line x1={x(hoverIdx)} y1={PAD_TOP} x2={x(hoverIdx)} y2={PAD_TOP + plotH} stroke="#475569" strokeWidth="1" strokeDasharray="3 3" />
        )}
      </svg>
    </div>
  );
};
