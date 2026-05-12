import { Activity } from 'lucide-react';
import { getVaTimeline } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';

/**
 * Year-by-year credit heatmap for a VA. Each column is a calendar year,
 * height is the credit count, and the saturated portion of the bar marks
 * the share that is in the user's collection. Empty years between the
 * earliest and latest credit are rendered as gap columns so the timeline
 * stays chronologically faithful.
 */
export async function VaTimeline({ sid }: { sid: string }) {
  const t = await getDict();
  const buckets = getVaTimeline(sid);
  if (buckets.length === 0) return null;

  const known = buckets.filter((b) => b.year > 0);
  const unknown = buckets.find((b) => b.year === 0);
  if (known.length === 0 && !unknown) return null;

  // Fill the gaps so a quiet stretch is visually obvious.
  const filled: typeof known = [];
  if (known.length > 0) {
    const min = known[0].year;
    const max = known[known.length - 1].year;
    for (let y = min; y <= max; y++) {
      const found = known.find((b) => b.year === y);
      filled.push(found ?? { year: y, total: 0, inCollection: 0, vnIds: [] });
    }
  }
  const max = filled.reduce((acc, b) => Math.max(acc, b.total), 1);

  return (
    <section className="rounded-xl border border-border bg-bg-card p-6">
      <h3 className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
        <Activity className="h-4 w-4 text-accent" /> {t.staff.timeline.title}
      </h3>
      <p className="mb-4 text-[11px] text-muted">{t.staff.timeline.hint}</p>
      <div className="flex items-end gap-1 overflow-x-auto pb-1">
        {filled.map((b) => {
          const heightPct = b.total > 0 ? Math.max(8, Math.round((b.total / max) * 100)) : 0;
          const inColPct = b.total > 0 ? Math.round((b.inCollection / b.total) * 100) : 0;
          return (
            <div
              key={b.year}
              className="flex w-7 shrink-0 flex-col items-center gap-0.5"
              title={`${b.year} · ${b.total} ${t.staff.timeline.creditsSuffix} · ${b.inCollection} ${t.staff.timeline.ownedSuffix}`}
            >
              <div className="relative flex h-24 w-full items-end overflow-hidden rounded-sm border border-border bg-bg-elev/40">
                {b.total > 0 && (
                  <div
                    className="relative w-full bg-bg-elev"
                    style={{ height: `${heightPct}%` }}
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 bg-accent"
                      style={{ height: `${inColPct}%` }}
                    />
                  </div>
                )}
              </div>
              <span className="text-[9px] text-muted">{String(b.year).slice(2)}</span>
            </div>
          );
        })}
      </div>
      {unknown && (
        <p className="mt-3 text-[10px] text-muted">
          + {unknown.total} {t.staff.timeline.unknownYear}
        </p>
      )}
    </section>
  );
}
