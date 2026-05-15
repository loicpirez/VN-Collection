import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Sparkles } from 'lucide-react';
import { db } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { EgsSyncBlock } from '@/components/EgsSyncBlock';
import { SafeImage } from '@/components/SafeImage';

export const dynamic = 'force-dynamic';

interface EgsLink {
  vn_id: string;
  vn_title: string;
  vn_image_thumb: string | null;
  vn_local_image_thumb: string | null;
  vn_image_sexual: number | null;
  egs_id: number;
  median: number | null;
  playtime_minutes: number | null;
  source: string | null;
}

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.egs.pageTitle };
}

/**
 * Page that mirrors `/steam` for EGS. Lists every EGS-linked VN with
 * its median rating and playtime, alongside the EGS-sync block (pull
 * user reviews / playtime). Lives parallel to `/steam` so users can
 * navigate the two integrations from the same data-management
 * mental model.
 */
export default async function EgsPage() {
  const t = await getDict();
  const links = db
    .prepare(`
      SELECT
        v.id            AS vn_id,
        v.title         AS vn_title,
        v.image_thumb   AS vn_image_thumb,
        v.local_image_thumb AS vn_local_image_thumb,
        v.image_sexual  AS vn_image_sexual,
        e.egs_id        AS egs_id,
        e.median        AS median,
        e.playtime_median_minutes AS playtime_minutes,
        e.source        AS source
      FROM egs_game e
      JOIN vn v ON v.id = e.vn_id
      JOIN collection c ON c.vn_id = e.vn_id
      ORDER BY v.title COLLATE NOCASE ASC
    `)
    .all() as EgsLink[];

  const matched = links.length;

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/data"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> {t.nav.data}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <Sparkles className="h-6 w-6 text-accent" aria-hidden /> {t.egs.pageTitle}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.egs.pageSubtitle}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span>{matched} {t.egs.linkedCount}</span>
        </div>
      </header>

      <section className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden /> {t.egsSync.title}
        </h2>
        <p className="mb-3 text-xs text-muted">{t.egsSync.subtitle}</p>
        <EgsSyncBlock />
      </section>

      <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h2 className="mb-3 text-base font-bold">{t.egs.linkedListTitle}</h2>
        {links.length === 0 ? (
          <p className="text-sm text-muted">{t.egs.linkedEmpty}</p>
        ) : (
          <ul
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
          >
            {links.map((l) => (
              <li key={l.vn_id}>
                <Link
                  href={`/vn/${l.vn_id}`}
                  className="group flex gap-3 rounded-lg border border-border bg-bg-elev/40 p-2 transition-colors hover:border-accent"
                >
                  <div className="h-20 w-14 shrink-0 overflow-hidden rounded">
                    <SafeImage
                      src={l.vn_image_thumb}
                      localSrc={l.vn_local_image_thumb}
                      sexual={l.vn_image_sexual}
                      alt={l.vn_title}
                      className="h-full w-full"
                    />
                  </div>
                  <div className="min-w-0 flex-1 text-[11px]">
                    <p className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent">
                      {l.vn_title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      EGS #{l.egs_id}
                      {l.source && <span className="ml-1 text-[10px] opacity-70">· {l.source}</span>}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0 text-[11px] text-muted">
                      {l.median != null && (
                        <span className="text-accent">
                          {(l.median / 100).toFixed(2)} ★
                        </span>
                      )}
                      {l.playtime_minutes != null && l.playtime_minutes > 0 && (
                        <span>{Math.round(l.playtime_minutes / 60)} {t.year.hoursUnit}</span>
                      )}
                      <a
                        href={`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${l.egs_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="ml-auto inline-flex items-center gap-0.5 text-muted hover:text-accent"
                        aria-label={t.egs.openOnEgs}
                        title={t.egs.openOnEgs}
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
