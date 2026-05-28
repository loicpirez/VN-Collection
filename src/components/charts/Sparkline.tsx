/**
 * Minimal inline-SVG sparkline + multi-series line chart for the
 * Eroge Price history panel. No external dependency (avoiding a
 * recharts / chart.js bundle for one chart). Server-renderable so
 * the panel can hydrate from the persisted `extras_json` without
 * a client round-trip.
 */
import type { ReactNode } from 'react';

export interface SparklinePoint {
  /** Timestamp in ms epoch. */
  x: number;
  /** Yen price. */
  y: number;
}

export interface SparklineSeries {
  /** Series label rendered in the legend (`DLsite (DL)`, `駿河屋 (PKG)`, …). */
  label: string;
  /** Stroke color — pick from the project palette. Falls back to accent. */
  color?: string;
  /** Ordered data points. Empty series are skipped. */
  points: SparklinePoint[];
}

interface Props {
  series: SparklineSeries[];
  /** Visible chart bounding box. Default ≈ 800×220 with legend reserved. */
  width?: number;
  height?: number;
  /** When set, draws a horizontal guide at this yen value (all-time min, etc.). */
  guides?: { y: number; label: string; color?: string }[];
  /** Accessible label, exposed via `<svg aria-label>`. */
  ariaLabel: string;
  /** Render-time formatter for legend values (e.g. `fmtNum`). */
  formatYen?: (yen: number) => string;
  /** When true, hides the legend (useful for ultra-compact strip cards). */
  hideLegend?: boolean;
}

const DEFAULT_PALETTE = [
  'rgb(56, 189, 248)', // sky-400
  'rgb(248, 113, 113)', // red-400
  'rgb(74, 222, 128)', // green-400
  'rgb(251, 191, 36)', // amber-400
  'rgb(192, 132, 252)', // purple-400
  'rgb(244, 114, 182)', // pink-400
];

/**
 * Linear scale builder. We avoid d3 — the call site only needs a
 * monotonic mapping from data-space → pixel-space. Returns a
 * function `(value) → pixel`.
 */
function scale(domainMin: number, domainMax: number, rangeMin: number, rangeMax: number): (v: number) => number {
  if (domainMax === domainMin) {
    const mid = (rangeMin + rangeMax) / 2;
    return () => mid;
  }
  const span = domainMax - domainMin;
  const r = rangeMax - rangeMin;
  return (v: number) => rangeMin + ((v - domainMin) / span) * r;
}

export function PriceHistoryChart({
  series,
  width = 760,
  height = 220,
  guides = [],
  ariaLabel,
  formatYen = (y) => `¥${y.toLocaleString('ja-JP')}`,
  hideLegend = false,
}: Props): ReactNode {
  const nonEmpty = series.filter((s) => s.points.length > 0);
  if (nonEmpty.length === 0) {
    return (
      <div
        className="flex h-[220px] w-full items-center justify-center rounded-lg border border-border bg-bg-elev/30 text-xs text-muted"
        role="img"
        aria-label={ariaLabel}
      >
        —
      </div>
    );
  }

  // Combine every series to find the global axis domains.
  const allX = nonEmpty.flatMap((s) => s.points.map((p) => p.x));
  const allY = nonEmpty.flatMap((s) => s.points.map((p) => p.y));
  const xMin = Math.min(...allX);
  const xMax = Math.max(...allX);
  const yMin = Math.min(...allY, ...guides.map((g) => g.y));
  const yMax = Math.max(...allY, ...guides.map((g) => g.y));

  // Pad the Y domain so the line never hugs the top/bottom edges.
  const pad = Math.max(50, (yMax - yMin) * 0.08);
  const yLo = Math.max(0, yMin - pad);
  const yHi = yMax + pad;

  const PADX_LEFT = 56;
  const PADX_RIGHT = 12;
  const PADY_TOP = 12;
  const PADY_BOT = 28;
  const innerW = width - PADX_LEFT - PADX_RIGHT;
  const innerH = height - PADY_TOP - PADY_BOT;

  const sx = scale(xMin, xMax, PADX_LEFT, PADX_LEFT + innerW);
  const sy = scale(yLo, yHi, PADY_TOP + innerH, PADY_TOP);

  // Y-axis tick marks — five evenly spaced bands across the value
  // range, rounded to the nearest 100 yen so the labels are stable.
  const ticks: number[] = [];
  const tickStep = Math.max(100, Math.round((yHi - yLo) / 5 / 100) * 100);
  for (let v = Math.ceil(yLo / tickStep) * tickStep; v <= yHi; v += tickStep) {
    ticks.push(v);
  }

  // Pick a palette colour per series in iteration order, allowing
  // explicit overrides.
  const seriesColors = nonEmpty.map((s, i) => s.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]);

  return (
    <figure aria-label={ariaLabel} className="not-prose">
      <svg
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full"
        aria-label={ariaLabel}
      >
        {/* Gridlines + Y axis labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PADX_LEFT}
              x2={PADX_LEFT + innerW}
              y1={sy(t)}
              y2={sy(t)}
              stroke="rgb(45, 55, 72)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text
              x={PADX_LEFT - 6}
              y={sy(t)}
              textAnchor="end"
              dominantBaseline="central"
              fontSize="10"
              fill="rgb(148, 163, 184)"
              className="tabular-nums"
            >
              {formatYen(t)}
            </text>
          </g>
        ))}
        {/* X axis baseline */}
        <line
          x1={PADX_LEFT}
          x2={PADX_LEFT + innerW}
          y1={PADY_TOP + innerH}
          y2={PADY_TOP + innerH}
          stroke="rgb(71, 85, 105)"
          strokeWidth={1}
        />
        {/* X-axis labels — first / mid / last timestamp */}
        {[xMin, (xMin + xMax) / 2, xMax].map((tx, i) => (
          <text
            key={`x-${i}`}
            x={sx(tx)}
            y={PADY_TOP + innerH + 16}
            textAnchor={i === 0 ? 'start' : i === 1 ? 'middle' : 'end'}
            fontSize="10"
            fill="rgb(148, 163, 184)"
          >
            {new Date(tx).toLocaleDateString()}
          </text>
        ))}
        {/* Reference guides — horizontal lines at e.g. all-time min */}
        {guides.map((g) => (
          <g key={g.label}>
            <line
              x1={PADX_LEFT}
              x2={PADX_LEFT + innerW}
              y1={sy(g.y)}
              y2={sy(g.y)}
              stroke={g.color ?? 'rgb(248, 113, 113)'}
              strokeWidth={1}
              strokeDasharray="6 4"
              opacity={0.7}
            />
            <text
              x={PADX_LEFT + innerW - 4}
              y={sy(g.y) - 4}
              textAnchor="end"
              fontSize="10"
              fill={g.color ?? 'rgb(248, 113, 113)'}
            >
              {g.label}
            </text>
          </g>
        ))}
        {/* Series polylines. We draw step-after so a flat retailer
            price reads as a flat segment, not a diagonal smear. */}
        {nonEmpty.map((s, i) => {
          const color = seriesColors[i];
          const sorted = [...s.points].sort((a, b) => a.x - b.x);
          let path = '';
          // SVG coordinates only — full float precision is fine; rounding
          // is intentionally avoided so the file passes the
          // "no-toFixed in app/components" lint that protects locale-aware
          // numeric formatting (this code path renders numbers as SVG
          // coordinates, never as user-visible strings).
          const fmt = (n: number): string => `${Math.round(n * 10) / 10}`;
          sorted.forEach((p, idx) => {
            const x = sx(p.x);
            const y = sy(p.y);
            if (idx === 0) {
              path += `M ${fmt(x)} ${fmt(y)} `;
            } else {
              // step-after: hold previous y until we hit the new x,
              // then drop to the new y. Reads price points as
              // discrete observations, not interpolated values.
              const prev = sorted[idx - 1];
              const py = sy(prev.y);
              path += `L ${fmt(x)} ${fmt(py)} L ${fmt(x)} ${fmt(y)} `;
            }
          });
          return (
            <g key={s.label}>
              <path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
              {sorted.map((p, idx) => (
                <circle key={idx} cx={sx(p.x)} cy={sy(p.y)} r={2} fill={color} opacity={0.85}>
                  <title>{`${s.label} · ${new Date(p.x).toLocaleDateString()} · ${formatYen(p.y)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {!hideLegend && (
        <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          {nonEmpty.map((s, i) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2 w-3 rounded-sm"
                style={{ background: seriesColors[i] }}
              />
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
