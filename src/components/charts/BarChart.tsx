import Link from 'next/link';

interface Props {
  data: { label: string; value: number; href?: string; sublabel?: string }[];
  formatValue?: (v: number) => string;
  /** Percentage width for the longest bar (default 100). Use lower for visual padding. */
  maxWidthPct?: number;
  emptyMessage?: string;
  barClassName?: string;
}

export function HBarChart({ data, formatValue, maxWidthPct = 100, emptyMessage, barClassName = 'bg-accent' }: Props) {
  if (data.length === 0) {
    // No hardcoded default — every caller passes i18n copy. When the
    // caller forgets, render nothing instead of a stray French word.
    return emptyMessage ? <p className="py-6 text-center text-xs text-muted">{emptyMessage}</p> : null;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="flex flex-col gap-1.5">
      {data.map((d) => {
        const pct = (d.value / max) * maxWidthPct;
        // When the row is linkable, the whole li becomes a Link so
        // touch users can tap and reveal the full label on a
        // narrower viewport (the truncate + title tooltip is
        // unreachable without hover).
        const row = (
          <div className="grid grid-cols-[88px_1fr_auto] items-center gap-2 text-xs sm:grid-cols-[160px_1fr_auto] sm:gap-3">
            <span className="truncate text-muted" title={d.label}>{d.label}</span>
            <div className="relative h-3 overflow-hidden rounded-full bg-bg-elev">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all ${barClassName}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="tabular-nums font-bold">
              {formatValue ? formatValue(d.value) : d.value.toLocaleString()}
              {d.sublabel && <span className="ml-1 font-normal text-muted">{d.sublabel}</span>}
            </span>
          </div>
        );
        return (
          <li key={d.label}>
            {d.href ? (
              <Link href={d.href} className="block rounded-md hover:bg-bg-elev/30 focus-visible:bg-bg-elev/40">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface VBarPoint {
  label: string;
  value: number;
  href?: string;
  /** Tooltip shown on hover (defaults to "label : value"). */
  tooltip?: string;
}

export function VBarChart({
  data,
  height = 160,
  formatValue,
  barClassName = 'bg-accent',
  emptyMessage,
}: {
  data: VBarPoint[];
  height?: number;
  formatValue?: (v: number) => string;
  /** Tailwind class applied to each bar div. */
  barClassName?: string;
  emptyMessage?: string;
}) {
  if (data.length === 0) {
    return emptyMessage ? <p className="py-6 text-center text-xs text-muted">{emptyMessage}</p> : null;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div
      className="grid items-end gap-1"
      style={{
        height: `${height + 28}px`,
        gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`,
      }}
    >
      {data.map((d, i) => {
        const h = max > 0 ? (d.value / max) * height : 0;
        const formatted = formatValue ? formatValue(d.value) : d.value.toLocaleString();
        const tooltip = d.tooltip ?? `${d.label} · ${formatted}`;
        const inner = (
          <div
            className={`relative flex w-full flex-col items-center justify-end ${
              d.href ? 'cursor-pointer' : ''
            }`}
            style={{ height: height + 28 }}
            title={tooltip}
          >
            {d.value > 0 && (
              <span className="mb-1 text-[10px] font-bold tabular-nums text-white">{formatted}</span>
            )}
            <div
              className={`w-full rounded-t-sm transition-[height,opacity] duration-200 ${barClassName} ${
                d.href ? 'opacity-90 hover:opacity-100' : ''
              } ${d.value === 0 ? 'opacity-30' : ''}`}
              style={{ height: `${h}px` }}
            />
            <span className="mt-1 truncate text-[10px] text-muted">{d.label}</span>
          </div>
        );
        return d.href ? (
          <Link key={`${d.label}-${i}`} href={d.href} className="block">
            {inner}
          </Link>
        ) : (
          <div key={`${d.label}-${i}`}>{inner}</div>
        );
      })}
    </div>
  );
}

export function DonutChart({
  data,
  size = 120,
  thickness = 18,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`translate(${size / 2}, ${size / 2})`}>
          <circle r={r} fill="none" className="stroke-bg-elev" strokeWidth={thickness} />
          {data.map((d, i) => {
            const len = (d.value / total) * c;
            const dasharray = `${len} ${c - len}`;
            const offset = -acc;
            acc += len;
            return (
              <circle
                key={`${d.label}-${i}`}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={dasharray}
                strokeDashoffset={offset}
                transform="rotate(-90)"
                strokeLinecap="butt"
              />
            );
          })}
        </g>
        <text x={size / 2} y={size / 2 + 4} textAnchor="middle" className="fill-white text-xl font-bold">
          {total}
        </text>
      </svg>
      <ul className="flex flex-col gap-1 text-xs">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: d.color }} />
            <span className="text-muted">{d.label}</span>
            <span className="ml-auto tabular-nums font-bold text-white">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
