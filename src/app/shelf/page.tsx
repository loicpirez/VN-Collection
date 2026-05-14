import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowDown, Box, Coins, Library } from 'lucide-react';
import { listAllOwnedReleases, type ShelfEntry } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.nav.shelf };
}

function bucketKey(e: ShelfEntry): string {
  if (e.physical_location.length === 0) return '__unsorted__';
  return e.physical_location[0];
}

function fmtMoney(amount: number | null, currency: string | null): string {
  if (amount == null) return '—';
  const cur = currency || '';
  return `${amount.toFixed(2)} ${cur}`.trim();
}

export default async function ShelfPage() {
  const t = await getDict();
  const items = listAllOwnedReleases();

  const buckets = new Map<string, ShelfEntry[]>();
  for (const e of items) {
    const k = bucketKey(e);
    const cur = buckets.get(k);
    if (cur) cur.push(e);
    else buckets.set(k, [e]);
  }
  const sortedKeys = Array.from(buckets.keys()).sort((a, b) => {
    if (a === '__unsorted__') return 1;
    if (b === '__unsorted__') return -1;
    return a.localeCompare(b);
  });

  const totals = items.reduce(
    (acc, e) => {
      if (e.price_paid != null) {
        const cur = e.currency || '?';
        acc[cur] = (acc[cur] ?? 0) + e.price_paid;
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/data" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.nav.data}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <Library className="h-6 w-6 text-accent" /> {t.shelf.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.shelf.subtitle}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span>{items.length} {t.shelf.editionsCount}</span>
          {Object.entries(totals).map(([cur, total]) => (
            <span key={cur} className="inline-flex items-center gap-1">
              <Coins className="h-3 w-3 text-accent" /> {total.toFixed(2)} {cur}
            </span>
          ))}
        </div>
      </header>

      {items.length === 0 && (
        <p className="rounded-xl border border-border bg-bg-card p-4 sm:p-6 text-sm text-muted">
          {t.shelf.empty}
        </p>
      )}

      {sortedKeys.map((key) => {
        const list = buckets.get(key)!;
        const subtotals = list.reduce(
          (acc, e) => {
            if (e.price_paid != null) {
              const cur = e.currency || '?';
              acc[cur] = (acc[cur] ?? 0) + e.price_paid;
            }
            return acc;
          },
          {} as Record<string, number>,
        );
        return (
          <section key={key} className="mb-6 rounded-xl border border-border bg-bg-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-baseline justify-between gap-2 text-xs font-bold uppercase tracking-widest text-muted">
              <span>{key === '__unsorted__' ? t.shelf.unsorted : key}</span>
              <span className="text-[11px] font-normal text-muted">
                {list.length} ·{' '}
                {Object.entries(subtotals).map(([cur, total]) => (
                  <span key={cur} className="ml-1">{total.toFixed(2)} {cur}</span>
                ))}
              </span>
            </h2>
            <ul
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
            >
              {list.map((e) => (
                <li key={`${e.vn_id}-${e.release_id}`}>
                  <Link
                    href={`/vn/${e.vn_id}`}
                    className="group flex gap-3 rounded-lg border border-border bg-bg-elev/40 p-2 transition-colors hover:border-accent"
                  >
                    <div className="h-20 w-14 shrink-0 overflow-hidden rounded">
                      <SafeImage
                        src={e.vn_image_url || e.vn_image_thumb}
                        localSrc={e.vn_local_image_thumb}
                        sexual={e.vn_image_sexual}
                        alt={e.vn_title}
                        className="h-full w-full"
                      />
                    </div>
                    <div className="min-w-0 flex-1 text-[11px]">
                      <p className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent">
                        {e.vn_title}
                      </p>
                      {e.edition_label && (
                        <p className="line-clamp-1 text-[10px] text-muted">{e.edition_label}</p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted">
                        {e.box_type !== 'none' && (
                          <span className="inline-flex items-center gap-0.5">
                            <Box className="h-2.5 w-2.5" /> {e.box_type}
                          </span>
                        )}
                        {e.condition && <span>{e.condition}</span>}
                        {e.price_paid != null && (
                          <span className="text-accent">{fmtMoney(e.price_paid, e.currency)}</span>
                        )}
                        {e.dumped && (
                          <span className="inline-flex items-center gap-0.5 text-status-completed">
                            <ArrowDown className="h-2.5 w-2.5" /> {t.shelf.dumped}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
