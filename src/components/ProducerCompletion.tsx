import Link from 'next/link';
import { Check, Plus, Trophy } from 'lucide-react';
import { fetchProducerCompletion } from '@/lib/producer-completion';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from './SafeImage';

/**
 * "You own X out of Y" panel for a single producer. Renders nothing while
 * the producer has zero developer credits on VNDB (or VNDB is unreachable),
 * to avoid muddying the page when the cross-reference can't be drawn.
 */
export async function ProducerCompletion({ producerId }: { producerId: string }) {
  const t = await getDict();
  let data;
  try {
    data = await fetchProducerCompletion(producerId);
  } catch {
    return null;
  }
  if (data.totalKnown === 0) return null;

  const missing = data.vns.filter((v) => !v.owned);

  return (
    <section className="mb-8 rounded-2xl border border-border bg-bg-card p-6">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-lg font-bold">
          <Trophy className="h-5 w-5 text-accent" /> {t.producerCompletion.title}
        </h2>
        <span className="text-xs text-muted">
          <span className="font-bold text-accent">{data.ownedCount}/{data.totalKnown}</span> · {data.pct}%
        </span>
      </div>
      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-bg-elev">
        <div className="h-full bg-accent transition-[width]" style={{ width: `${data.pct}%` }} />
      </div>

      {missing.length === 0 ? (
        <p className="text-sm text-status-completed">
          <Check className="mr-1 inline-block h-4 w-4" />
          {t.producerCompletion.allOwned}
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            {t.producerCompletion.missingHint.replace('{n}', String(missing.length))}
          </p>
          <ul className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {missing.map((v) => (
              <li key={v.vnId}>
                <Link
                  href={`/vn/${v.vnId}`}
                  className="group flex gap-2 rounded-lg border border-border bg-bg-elev/40 p-2 transition-colors hover:border-accent"
                >
                  <div className="h-16 w-11 shrink-0 overflow-hidden rounded">
                    <SafeImage
                      src={v.image?.thumbnail || v.image?.url || null}
                      sexual={v.image?.sexual ?? null}
                      alt={v.title}
                      className="h-full w-full"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent">
                      {v.title}
                    </h3>
                    <p className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
                      {v.released?.slice(0, 4) && <span>{v.released.slice(0, 4)}</span>}
                      {v.rating != null && <span className="text-accent">★ {(v.rating / 10).toFixed(1)}</span>}
                    </p>
                  </div>
                  <Plus className="h-3 w-3 self-start text-muted transition-colors group-hover:text-accent" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
