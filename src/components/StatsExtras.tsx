import Link from 'next/link';
import { Award, Clock, Layers, Star } from 'lucide-react';
import { bestRoi, ratingHistogram, tagsCompletedPerYear } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';

function fmt(m: number): string {
  if (m <= 0) return '—';
  const h = Math.floor(m / 60);
  const mn = m % 60;
  if (h && mn) return `${h}h ${mn}m`;
  if (h) return `${h}h`;
  return `${mn}m`;
}

/**
 * Three richer breakdowns rendered together at the bottom of /stats:
 *
 *   - Score distribution vs VNDB (10-point bins).
 *   - Best ROI ranking (user_rating / playtime).
 *   - Genre evolution — stacked bars of your top tags by completion year.
 *
 * All three depend on having ≥ 5 user-rated, completed entries before they
 * become useful; if the collection is too small we render a quiet hint
 * instead of empty bar charts.
 */
export async function StatsExtras() {
  const t = await getDict();
  const hist = ratingHistogram();
  const roi = bestRoi(15);
  const tagYears = tagsCompletedPerYear(8);

  const histMax = Math.max(1, ...hist.flatMap((b) => [b.mine, b.vndb]));
  const tagYearMap = new Map<number, Map<string, number>>();
  const tagOrder: string[] = [];
  for (const row of tagYears) {
    if (!tagYearMap.has(row.year)) tagYearMap.set(row.year, new Map());
    tagYearMap.get(row.year)!.set(row.tag, row.count);
    if (!tagOrder.includes(row.tag)) tagOrder.push(row.tag);
  }
  const years = Array.from(tagYearMap.keys()).sort();

  return (
    <>
      <section className="rounded-2xl border border-border bg-bg-card p-6">
        <h2 className="mb-3 inline-flex items-center gap-2 text-lg font-bold">
          <Star className="h-5 w-5 text-accent" /> {t.statsExtras.histogramTitle}
        </h2>
        <p className="mb-4 text-xs text-muted">{t.statsExtras.histogramHint}</p>
        <div className="flex items-end gap-1">
          {hist.map((b) => (
            <div key={b.bucket} className="flex w-9 flex-col items-center gap-1">
              <div className="relative flex h-32 w-full items-end gap-0.5">
                <div
                  className="w-1/2 rounded-t bg-accent"
                  style={{ height: `${(b.mine / histMax) * 100}%` }}
                  title={`${b.bucket} · ${b.mine}`}
                />
                <div
                  className="w-1/2 rounded-t bg-muted"
                  style={{ height: `${(b.vndb / histMax) * 100}%` }}
                  title={`${b.bucket} · VNDB ${b.vndb}`}
                />
              </div>
              <span className="text-[10px] text-muted">{b.bucket}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-accent" /> {t.statsExtras.legendMine}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-muted" /> {t.statsExtras.legendVndb}
          </span>
        </div>
      </section>

      {roi.length >= 1 && (
        <section className="rounded-2xl border border-border bg-bg-card p-6">
          <h2 className="mb-3 inline-flex items-center gap-2 text-lg font-bold">
            <Award className="h-5 w-5 text-accent" /> {t.statsExtras.roiTitle}
          </h2>
          <p className="mb-4 text-xs text-muted">{t.statsExtras.roiHint}</p>
          <ol className="space-y-1.5 text-sm">
            {roi.map((r, i) => (
              <li key={r.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">
                  <span className="mr-2 text-[10px] text-muted">#{i + 1}</span>
                  <Link href={`/vn/${r.id}`} className="font-semibold hover:text-accent">{r.title}</Link>
                </span>
                <span className="text-[11px] text-muted">
                  <span className="text-accent">{(r.user_rating / 10).toFixed(1)}</span>
                  <span className="mx-1 opacity-50">/</span>
                  <Clock className="mr-0.5 inline-block h-3 w-3" />
                  <span>{fmt(r.playtime_minutes)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {years.length > 0 && (
        <section className="rounded-2xl border border-border bg-bg-card p-6">
          <h2 className="mb-3 inline-flex items-center gap-2 text-lg font-bold">
            <Layers className="h-5 w-5 text-accent" /> {t.statsExtras.genreTitle}
          </h2>
          <p className="mb-4 text-xs text-muted">{t.statsExtras.genreHint}</p>
          <div className="space-y-1.5">
            {years.map((y) => {
              const m = tagYearMap.get(y)!;
              const total = Array.from(m.values()).reduce((a, n) => a + n, 0);
              return (
                <div key={y} className="flex items-center gap-2 text-xs">
                  <span className="w-12 font-mono text-muted">{y}</span>
                  <div className="flex h-4 flex-1 overflow-hidden rounded-md bg-bg-elev/40">
                    {tagOrder.map((tag, idx) => {
                      const n = m.get(tag) ?? 0;
                      if (n === 0) return null;
                      const w = total > 0 ? (n / total) * 100 : 0;
                      const hue = (idx * 71) % 360;
                      return (
                        <div
                          key={tag}
                          style={{ width: `${w}%`, background: `hsl(${hue}, 50%, 45%)` }}
                          title={`${tag} · ${n}`}
                        />
                      );
                    })}
                  </div>
                  <span className="w-8 text-right font-mono text-[10px] text-muted">{total}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tagOrder.map((tag, idx) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-md bg-bg-elev/40 px-1.5 py-0.5 text-[10px]"
              >
                <span
                  className="h-2 w-2 rounded-sm"
                  style={{ background: `hsl(${(idx * 71) % 360}, 50%, 45%)` }}
                />
                {tag}
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
