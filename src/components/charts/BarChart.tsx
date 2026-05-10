interface Props {
  data: { label: string; value: number; href?: string; sublabel?: string }[];
  formatValue?: (v: number) => string;
  /** Percentage width for the longest bar (default 100). Use lower for visual padding. */
  maxWidthPct?: number;
  emptyMessage?: string;
  barClassName?: string;
}

export function HBarChart({ data, formatValue, maxWidthPct = 100, emptyMessage = 'Aucune donnée', barClassName = 'bg-accent' }: Props) {
  if (data.length === 0) {
    return <p className="py-6 text-center text-xs text-muted">{emptyMessage}</p>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="flex flex-col gap-1.5">
      {data.map((d) => {
        const pct = (d.value / max) * maxWidthPct;
        return (
          <li key={d.label} className="grid grid-cols-[120px_1fr_auto] items-center gap-3 text-xs">
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
          </li>
        );
      })}
    </ul>
  );
}

export function VBarChart({
  data,
  height = 140,
  formatValue,
  barClassName = 'fill-accent',
}: {
  data: { label: string; value: number }[];
  height?: number;
  formatValue?: (v: number) => string;
  barClassName?: string;
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 30;
  const gap = 6;
  const total = data.length * (w + gap) - gap;
  return (
    <div className="overflow-x-auto">
      <svg
        width={total + 24}
        height={height + 30}
        viewBox={`0 0 ${total + 24} ${height + 30}`}
        className="block"
      >
        {data.map((d, i) => {
          const h = max > 0 ? (d.value / max) * height : 0;
          const x = 12 + i * (w + gap);
          const y = height - h + 4;
          return (
            <g key={`${d.label}-${i}`}>
              <rect x={x} y={y} width={w} height={h} className={barClassName} rx={3} />
              {d.value > 0 && (
                <text x={x + w / 2} y={y - 4} textAnchor="middle" className="fill-white" fontSize="9">
                  {formatValue ? formatValue(d.value) : d.value}
                </text>
              )}
              <text x={x + w / 2} y={height + 18} textAnchor="middle" className="fill-muted" fontSize="9">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
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
