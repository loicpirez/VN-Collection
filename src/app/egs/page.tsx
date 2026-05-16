import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Search as SearchIcon, Sparkles, Star } from 'lucide-react';
import { db } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { EgsSyncBlock } from '@/components/EgsSyncBlock';
import { MapVnToEgsButton } from '@/components/MapVnToEgsButton';
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

function egsSourceLabel(source: string, t: Awaited<ReturnType<typeof getDict>>): string {
  switch (source) {
    case 'extlink':
      return t.matchBadges.viaExtlink;
    case 'search':
      return t.matchBadges.viaSearch;
    case 'manual':
      return t.matchBadges.viaManual;
    default:
      return source;
  }
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

  // Surface how many collection VNs have NO EGS link at all so the user
  // knows the page isn't claiming completeness when it shows N entries.
  // Counts every collection VN where either `egs_game` has no row at
  // all, or has a row with `source IS NULL` (probed, no match found).
  const unmatched = (
    db
      .prepare(`
        SELECT COUNT(*) AS n FROM collection c
        WHERE NOT EXISTS (
          SELECT 1 FROM egs_game e WHERE e.vn_id = c.vn_id AND e.source IS NOT NULL
        )
      `)
      .get() as { n: number }
  ).n;

  // Pull a paginated batch of unlinked VNs so the user can act on them
  // without leaving the page. Cap at 50 to keep the listing manageable.
  const unlinkedRows = db
    .prepare(`
      SELECT
        v.id              AS vn_id,
        v.title           AS vn_title,
        v.alttitle        AS vn_alttitle,
        v.image_thumb     AS vn_image_thumb,
        v.local_image_thumb AS vn_local_image_thumb,
        v.image_sexual    AS vn_image_sexual
      FROM collection c
      JOIN vn v ON v.id = c.vn_id
      WHERE NOT EXISTS (
        SELECT 1 FROM egs_game e WHERE e.vn_id = c.vn_id AND e.source IS NOT NULL
      )
      ORDER BY v.title COLLATE NOCASE ASC
      LIMIT 50
    `)
    .all() as Array<{
      vn_id: string;
      vn_title: string;
      vn_alttitle: string | null;
      vn_image_thumb: string | null;
      vn_local_image_thumb: string | null;
      vn_image_sexual: number | null;
    }>;

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
          {unmatched > 0 && (
            <span className="rounded-full border border-status-on_hold/40 bg-status-on_hold/10 px-2 py-0.5 text-status-on_hold">
              {t.egs.unlinkedCount.replace('{n}', String(unmatched))}
            </span>
          )}
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
              <li
                key={l.vn_id}
                className="group flex gap-3 rounded-lg border border-border bg-bg-elev/40 p-2 transition-colors focus-within:border-accent hover:border-accent"
              >
                {/* The whole row used to be a single Next <Link> with an
                    external EGS <a> nested inside — invalid HTML (nested
                    <a>) that hydrates with a React warning and made the
                    external link unreliable. Refactored: the row is a
                    plain <li>; the cover + title is one Link, the
                    external chip is a sibling <a>. Both interactives are
                    keyboard-reachable independently. */}
                <Link
                  href={`/vn/${l.vn_id}`}
                  className="flex min-w-0 flex-1 items-start gap-3"
                  aria-label={l.vn_title}
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
                      {l.source && <span className="ml-1 text-[10px] opacity-70">· {egsSourceLabel(l.source, t)}</span>}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0 text-[11px] text-muted">
                      {l.median != null && (
                        <span className="text-accent">
                          <Star className="mr-0.5 inline h-3 w-3 fill-accent" aria-hidden /> {(l.median / 100).toFixed(2)}
                        </span>
                      )}
                      {l.playtime_minutes != null && l.playtime_minutes > 0 && (
                        <span>{Math.round(l.playtime_minutes / 60)} {t.year.hoursUnit}</span>
                      )}
                    </div>
                  </div>
                </Link>
                <a
                  href={`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${l.egs_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap-target-tight self-start inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-bg-elev hover:text-accent"
                  aria-label={t.egs.openOnEgs}
                  title={t.egs.openOnEgs}
                >
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {unlinkedRows.length > 0 && (
        <section className="mt-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
          <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
            <SearchIcon className="h-4 w-4 text-status-on_hold" aria-hidden />
            {t.egs.unlinkedListTitle}
          </h2>
          <p className="mb-3 text-xs text-muted">{t.egs.unlinkedListHint}</p>
          <ul
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
          >
            {unlinkedRows.map((u) => (
              <li
                key={u.vn_id}
                className="group flex gap-3 rounded-lg border border-border bg-bg-elev/40 p-2 transition-colors focus-within:border-accent hover:border-accent"
              >
                <Link
                  href={`/vn/${u.vn_id}`}
                  className="flex min-w-0 flex-1 items-start gap-3"
                  aria-label={u.vn_title}
                >
                  <div className="h-20 w-14 shrink-0 overflow-hidden rounded">
                    <SafeImage
                      src={u.vn_image_thumb}
                      localSrc={u.vn_local_image_thumb}
                      sexual={u.vn_image_sexual}
                      alt={u.vn_title}
                      className="h-full w-full"
                    />
                  </div>
                  <div className="min-w-0 flex-1 text-[11px]">
                    <p className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent">
                      {u.vn_title}
                    </p>
                    {u.vn_alttitle && u.vn_alttitle !== u.vn_title && (
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-muted">{u.vn_alttitle}</p>
                    )}
                    <p className="mt-0.5 text-[10px] text-muted">{u.vn_id}</p>
                  </div>
                </Link>
                <div className="self-start">
                  <MapVnToEgsButton
                    vnId={u.vn_id}
                    seedQuery={u.vn_alttitle || u.vn_title}
                    variant="compact"
                  />
                </div>
              </li>
            ))}
          </ul>
          {unmatched > unlinkedRows.length && (
            <p className="mt-3 text-[11px] text-muted">
              {t.egs.unlinkedMoreHint.replace('{n}', String(unmatched - unlinkedRows.length))}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
