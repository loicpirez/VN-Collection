import Link from 'next/link';
import { CakeSlice } from 'lucide-react';
import { todaysAnniversaries } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from './SafeImage';

/**
 * Surfaces VNs whose release date's month/day matches today, anywhere in
 * the collection. Rendered above the library grid on the home page;
 * hidden entirely when nothing matches so it doesn't take vertical space
 * on most days.
 */
export async function AnniversaryFeed() {
  const t = await getDict();
  const rows = todaysAnniversaries();
  if (rows.length === 0) return null;

  return (
    <aside className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-3">
      <h3 className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-accent">
        <CakeSlice className="h-3.5 w-3.5" /> {t.anniversary.title}
      </h3>
      <ul className="flex flex-wrap gap-2">
        {rows.slice(0, 8).map((r) => (
          <li key={r.id}>
            <Link
              href={`/vn/${r.id}`}
              className="group flex items-center gap-2 rounded-md bg-bg-card/80 px-2 py-1 text-xs hover:bg-bg-card"
            >
              <div className="h-8 w-6 overflow-hidden rounded">
                <SafeImage
                  src={r.image_thumb || r.image_url}
                  localSrc={r.local_image_thumb}
                  sexual={r.image_sexual ?? null}
                  alt={r.title}
                  className="h-full w-full"
                />
              </div>
              <span className="flex flex-col">
                <span className="line-clamp-1 max-w-[200px] font-semibold transition-colors group-hover:text-accent">
                  {r.title}
                </span>
                <span className="text-[10px] text-muted">{t.anniversary.yearsAgo.replace('{n}', String(r.years))}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
