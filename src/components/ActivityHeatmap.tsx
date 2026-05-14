import { activityHeatmap, type DailyCount } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';

/**
 * GitHub-style 52-week heatmap. Each column is a calendar week (Mon-Sun),
 * each row a day. Saturation tracks the daily activity count clamped to a
 * five-level scale so a heavy week reads vivid without nuking the contrast
 * of quiet ones.
 */
export async function ActivityHeatmap({ year }: { year: number }) {
  const t = await getDict();
  const data = activityHeatmap(year);
  const byDay = new Map<string, number>(data.map((d) => [d.day, d.count]));

  const start = new Date(`${year}-01-01T00:00:00Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00Z`);
  const days: { day: string; count: number; ts: number }[] = [];
  for (let ts = start.getTime(); ts < end.getTime(); ts += 86400_000) {
    const iso = new Date(ts).toISOString().slice(0, 10);
    days.push({ day: iso, count: byDay.get(iso) ?? 0, ts });
  }

  const max = Math.max(1, ...days.map((d) => d.count));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const tones = [
    'bg-bg-elev/40',
    'bg-accent/20',
    'bg-accent/40',
    'bg-accent/65',
    'bg-accent',
  ];

  // Pad leading days so column 0 starts on a Monday.
  const firstDow = (start.getUTCDay() + 6) % 7; // 0 = Mon
  const pad = Array.from({ length: firstDow }, () => null);
  const grid: ({ day: string; count: number } | null)[] = [...pad, ...days];

  const weeks: ({ day: string; count: number } | null)[][] = [];
  for (let w = 0; w < Math.ceil(grid.length / 7); w++) {
    weeks.push(grid.slice(w * 7, w * 7 + 7));
  }

  const total = days.reduce((a, d) => a + d.count, 0);
  const active = days.filter((d) => d.count > 0).length;

  return (
    <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted">
          {t.year.heatmap.title.replace('{year}', String(year))}
        </h3>
        <span className="text-[11px] text-muted">
          {total} {t.year.heatmap.entries} · {active} {t.year.heatmap.activeDays}
        </span>
      </div>
      <div className="flex gap-[3px] overflow-x-auto">
        {weeks.map((wk, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {wk.map((d, j) =>
              d ? (
                <div
                  key={j}
                  className={`h-[10px] w-[10px] rounded-sm ${tones[level(d.count)]}`}
                  title={`${d.day} · ${d.count}`}
                />
              ) : (
                <div key={j} className="h-[10px] w-[10px]" />
              ),
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1 text-[10px] text-muted">
        <span>{t.year.heatmap.less}</span>
        {tones.slice(1).map((tn, i) => (
          <span key={i} className={`h-[8px] w-[10px] rounded-sm ${tn}`} />
        ))}
        <span>{t.year.heatmap.more}</span>
      </div>
    </section>
  );
}

export type { DailyCount };
