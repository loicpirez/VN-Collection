import Link from 'next/link';
import type { CoOccurringTag } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';

const CATEGORY_TONE: Record<string, string> = {
  cont: 'border-accent/40 text-white/85',
  ero: 'border-status-dropped/40 text-status-dropped',
  tech: 'border-status-on_hold/40 text-status-on_hold',
};

/**
 * Tags from other VNs in the collection that share at least one tag with
 * the seed VN. Bars are sized relative to the top entry's share count so
 * the dominant cluster pops visually. The VN page only mounts this when
 * `rows` has co-occurrence signal (2+ entries), so the enclosing section
 * frame is never rendered empty.
 */
export async function TagCoOccurrence({ rows }: { rows: CoOccurringTag[] }) {
  const t = await getDict();
  const max = rows[0].shared;

  return (
    <section className="p-4 sm:p-6">
      <p className="mb-4 text-[11px] text-muted">{t.tags.cooccurrence.hint}</p>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {rows.map((r) => {
          const pct = max > 0 ? Math.max(8, Math.round((r.shared / max) * 100)) : 0;
          const tone = r.category ? CATEGORY_TONE[r.category] ?? CATEGORY_TONE.cont : CATEGORY_TONE.cont;
          return (
            <li key={r.id}>
              <Link
                href={`/?tag=${encodeURIComponent(r.id)}`}
                className={`group relative block overflow-hidden rounded-md border bg-bg-elev/30 px-2.5 py-1 text-xs transition-colors hover:border-accent ${tone}`}
                title={`${r.shared} ${t.tags.cooccurrence.sharedSuffix}`}
              >
                <div
                  className="absolute inset-y-0 left-0 bg-accent/10 transition-[width] group-hover:bg-accent/20"
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
                <div className="relative flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold" title={r.name}>{r.name}</span>
                  <span className="shrink-0 text-[10px] text-muted">{r.shared}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
