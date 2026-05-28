'use client';

/**
 * Multi-series price history chart for the Eroge Price panel.
 *
 * Switched from a custom inline-SVG implementation to recharts so the
 * chart inherits everything a standard library provides: hover
 * tooltips, accessible tab order, ticks, axis labels, dotted guides,
 * series legend, responsive width. The whole module is lazy-loaded
 * via `next/dynamic` (`ssr: false`) by StockPanel so the recharts
 * bundle only ships when the operator opens a VN page with stored
 * eroge_price data.
 *
 * The exported surface matches the previous inline-SVG signature
 * (`series`, `guides`, `ariaLabel`, `formatYen`, `hideLegend`) so
 * the panel call site doesn't need to change.
 */
import type { ReactNode } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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

export const DEFAULT_PALETTE = [
  'rgb(56, 189, 248)', // sky-400
  'rgb(248, 113, 113)', // red-400
  'rgb(74, 222, 128)', // green-400
  'rgb(251, 191, 36)', // amber-400
  'rgb(192, 132, 252)', // purple-400
  'rgb(244, 114, 182)', // pink-400
];

/**
 * Recharts works best on a single rows array keyed by X. Collapse every
 * series into one rows array of the shape `{ x, [seriesLabel]: y }` so
 * recharts can interpolate one point per series per X. Missing values
 * (one retailer hasn't sold the title yet) end up as `null`, which
 * recharts treats as a gap.
 */
function buildRows(series: SparklineSeries[]): Record<string, number | null>[] {
  const xs = new Set<number>();
  for (const s of series) for (const p of s.points) xs.add(p.x);
  const sorted = Array.from(xs).sort((a, b) => a - b);
  return sorted.map((x) => {
    const row: Record<string, number | null> = { x };
    for (const s of series) {
      const pt = s.points.find((p) => p.x === x);
      row[s.label] = pt ? pt.y : null;
    }
    return row;
  });
}

export function PriceHistoryChart({
  series,
  width: _width,
  height = 240,
  guides = [],
  ariaLabel,
  formatYen = (y) => `¥${y.toLocaleString('ja-JP')}`,
  hideLegend = false,
}: Props): ReactNode {
  const nonEmpty = series.filter((s) => s.points.length > 0);
  if (nonEmpty.length === 0) {
    return (
      <div
        className="flex h-[240px] w-full items-center justify-center rounded-lg border border-border bg-bg-elev/30 text-xs text-muted"
        role="img"
        aria-label={ariaLabel}
      >
        —
      </div>
    );
  }

  const rows = buildRows(nonEmpty);
  const colors = nonEmpty.map((s, i) => s.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]);

  return (
    <figure aria-label={ariaLabel} className="not-prose">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(45, 55, 72)" />
          <XAxis
            dataKey="x"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fontSize: 10, fill: 'rgb(148, 163, 184)' }}
            tickFormatter={(v: number) => new Date(v).toLocaleDateString()}
            stroke="rgb(71, 85, 105)"
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'rgb(148, 163, 184)' }}
            tickFormatter={(v: number) => formatYen(v)}
            width={64}
            stroke="rgb(71, 85, 105)"
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgb(45, 55, 72)',
              borderRadius: 8,
              fontSize: 11,
            }}
            labelFormatter={(v) =>
              typeof v === 'number' ? new Date(v).toLocaleDateString() : String(v ?? '')
            }
            formatter={(value, name) => {
              const v = typeof value === 'number' ? formatYen(value) : (value as string);
              return [v, name as string];
            }}
          />
          {!hideLegend && <Legend wrapperStyle={{ fontSize: 11, color: 'rgb(148, 163, 184)' }} />}
          {guides.map((g) => (
            <ReferenceLine
              key={g.label}
              y={g.y}
              stroke={g.color ?? 'rgb(248, 113, 113)'}
              strokeDasharray="6 4"
              strokeOpacity={0.7}
              label={{
                value: g.label,
                position: 'insideRight',
                fill: g.color ?? 'rgb(248, 113, 113)',
                fontSize: 10,
              }}
            />
          ))}
          {nonEmpty.map((s, i) => (
            <Line
              key={s.label}
              type="stepAfter"
              dataKey={s.label}
              stroke={colors[i]}
              strokeWidth={1.6}
              dot={{ r: 2.5, fill: colors[i] }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}
