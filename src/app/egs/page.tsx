import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, ExternalLink, Search as SearchIcon, Sparkles, Star } from 'lucide-react';
import { db } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { EgsSyncBlock } from '@/components/EgsSyncBlock';
import { MapVnToEgsButton } from '@/components/MapVnToEgsButton';
import { CardDensitySlider } from '@/components/CardDensitySlider';
import { DensityScopeProvider } from '@/components/DensityScopeProvider';
import { ResetViewDefaultsButton } from '@/components/ResetViewDefaultsButton';
import { SafeImage } from '@/components/SafeImage';
import { SkeletonCardGrid, SkeletonRows } from '@/components/Skeleton';

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

function egsSourceLabel(source: string | null, t: Awaited<ReturnType<typeof getDict>>): string {
  switch (source) {
    case 'extlink':
      return t.egs.sourceExtlink;
    case 'search':
      return t.egs.sourceAuto;
    case 'manual':
      return t.egs.sourceManual;
    case null:
    case '':
      return t.egs.sourceNone;
    default:
      return source ?? '';
  }
}

/**
 * Tailwind classes for the per-card source chip. Keeps the colour
 * mapping in one place so the linked + unlinked sections render the
 * same vocabulary.
 */
function egsSourceChipClass(source: string | null): string {
  switch (source) {
    case 'manual':
      return 'border-accent/40 bg-accent/10 text-accent';
    case 'extlink':
      return 'border-status-completed/40 bg-status-completed/10 text-status-completed';
    case 'search':
      return 'border-accent-blue/40 bg-accent-blue/10 text-accent-blue';
    default:
      return 'border-border bg-bg-elev/40 text-muted';
  }
}

/**
 * Page that mirrors `/steam` for EGS. Lists every EGS-linked VN with
 * its median rating and playtime, alongside the EGS-sync block (pull
 * user reviews / playtime). Lives parallel to `/steam` so users can
 * navigate the two integrations from the same data-management
 * mental model.
 */
interface EgsPageData {
  links: EgsLink[];
  unlinkedRows: Array<{
    vn_id: string;
    vn_title: string;
    vn_alttitle: string | null;
    vn_image_thumb: string | null;
    vn_local_image_thumb: string | null;
    vn_image_sexual: number | null;
  }>;
  unmatched: number;
  error: string | null;
}

/**
 * Read every EGS data source the page needs. Wrapped in try/catch so a
 * SQLite migration mismatch or a corrupted JSON column never blows up
 * the whole page — the error band renders instead and the operator can
 * still reach the EGS sync block at the top.
 */
function loadEgsPageData(): EgsPageData {
  try {
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
      .all() as EgsPageData['unlinkedRows'];

    return { links, unlinkedRows, unmatched, error: null };
  } catch (e) {
    return { links: [], unlinkedRows: [], unmatched: 0, error: (e as Error).message };
  }
}

export default async function EgsPage() {
  const t = await getDict();
  return (
    <Suspense fallback={<EgsPageSkeleton t={t} />}>
      <EgsPageContent />
    </Suspense>
  );
}

function EgsPageSkeleton({ t }: { t: Awaited<ReturnType<typeof getDict>> }) {
  return (
    <DensityScopeProvider scope="egs" className="mx-auto max-w-6xl">
      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <Sparkles className="h-6 w-6 text-accent" aria-hidden /> {t.egs.pageTitle}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.egs.pageSubtitle}</p>
      </header>
      <div className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <SkeletonCardGrid count={6} />
      </div>
      <div className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <SkeletonRows count={4} />
      </div>
    </DensityScopeProvider>
  );
}

async function EgsPageContent() {
  const t = await getDict();
  const { links, unlinkedRows, unmatched, error } = loadEgsPageData();
  const matched = links.length;

  return (
    <DensityScopeProvider scope="egs" className="mx-auto max-w-6xl">
      <Link
        href="/data"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden"
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

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-status-dropped/40 bg-status-dropped/10 p-4 text-sm text-status-dropped"
        >
          <p className="inline-flex items-center gap-2 font-bold">
            <AlertTriangle className="h-4 w-4" aria-hidden /> {t.egs.errorBandTitle}
          </p>
          <p className="mt-1 text-[12px] opacity-90">{t.egs.errorBandHint}</p>
          <p className="mt-1 break-all font-mono text-[11px] opacity-70">{error}</p>
        </div>
      )}

      <section className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden /> {t.egsSync.title}
        </h2>
        <p className="mb-3 text-xs text-muted">{t.egsSync.subtitle}</p>
        <EgsSyncBlock />
      </section>

      <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold">{t.egs.linkedListTitle}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <CardDensitySlider scope="egs" />
            <ResetViewDefaultsButton scope="egs" />
          </div>
        </div>
        {links.length === 0 ? (
          <div className="rounded-lg border border-border bg-bg-elev/30 p-4 text-sm text-muted">
            <p>{t.egs.linkedEmpty}</p>
            <p className="mt-2 text-[12px] opacity-80">{t.egs.linkedEmptyHint}</p>
          </div>
        ) : (
          <ul
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 260px)), 1fr))' }}
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
                  <div
                    className="shrink-0 overflow-hidden rounded"
                    style={{
                      width: 'clamp(72px, calc(var(--card-density-px, 220px) * 0.42), 200px)',
                      aspectRatio: '2 / 3',
                    }}
                  >
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
                    </p>
                    <p
                      data-egs-status-chip
                      className={`mt-0.5 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${egsSourceChipClass(l.source)}`}
                    >
                      {egsSourceLabel(l.source, t)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0 text-[11px] text-muted">
                      {l.median != null && (
                        <span className="text-accent" title={`${l.median}/100`}>
                          <Star className="mr-0.5 inline h-3 w-3 fill-accent" aria-hidden /> {l.median}/100
                        </span>
                      )}
                      {l.playtime_minutes != null && l.playtime_minutes > 0 && (
                        <span>{Math.round(l.playtime_minutes / 60)} {t.year.hoursUnit}</span>
                      )}
                    </div>
                  </div>
                </Link>
                <div className="flex shrink-0 flex-col items-end gap-1" data-egs-card-actions>
                  <a
                    href={`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${l.egs_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tap-target-tight self-start inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-bg-elev hover:text-accent"
                    aria-label={t.egs.openOnEgs}
                    title={t.egs.openOnEgs}
                    data-egs-action="open-egs"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                  <div data-egs-action="remap">
                    <MapVnToEgsButton vnId={l.vn_id} seedQuery={l.vn_title} variant="compact" />
                  </div>
                </div>
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
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 260px)), 1fr))' }}
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
                  <div
                    className="shrink-0 overflow-hidden rounded"
                    style={{
                      width: 'clamp(72px, calc(var(--card-density-px, 220px) * 0.42), 200px)',
                      aspectRatio: '2 / 3',
                    }}
                  >
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
                <div className="flex shrink-0 flex-col items-end gap-1" data-egs-card-actions>
                  <span
                    data-egs-status-chip
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${egsSourceChipClass(null)}`}
                  >
                    {t.egs.sourceNone}
                  </span>
                  <div data-egs-action="map-vn-to-egs">
                    <MapVnToEgsButton
                      vnId={u.vn_id}
                      seedQuery={u.vn_alttitle || u.vn_title}
                      variant="compact"
                    />
                  </div>
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
    </DensityScopeProvider>
  );
}
