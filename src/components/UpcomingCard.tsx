import Link from 'next/link';
import { ExternalLink, Library as LibraryIcon } from 'lucide-react';
import { SafeImage } from './SafeImage';
import { MapEgsToVndbButton } from './MapEgsToVndbButton';
import { AddMissingVnButton } from './AddMissingVnButton';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/**
 * Shared card used by every tab on `/upcoming` (collection / all / anticipated).
 *
 * Every tab MUST mount this so the affordance set is consistent:
 *   1. Open VNDB detail — internal `/vn/<id>` when the id is `v\d+`, OR
 *      an external `https://vndb.org/<id>` chip when only the EGS row
 *      knows the VNDB id.
 *   2. Open local detail — same `/vn/<id>` link, surfaced when the VN is
 *      in the operator's `collection` (the `inCollection` prop). Visually
 *      promotes the card so the operator can spot already-tracked entries.
 *   3. Add-to-collection — one-click POST `/api/collection/<id>` with
 *      `{ status: 'planning' }`. Hidden when there is no resolvable VNDB
 *      id yet (EGS row with no mapping) — the operator must Map first.
 *   4. Match / Map to VNDB — surfaces `<MapEgsToVndbButton>` when the row
 *      is EGS-only (no `vndbId`), so a misrouted EGS entry can be pinned
 *      to the right VNDB id without leaving the page.
 *
 * The card is intentionally a plain server component; interactivity is
 * scoped to the small client buttons it composes.
 */
export interface UpcomingCardData {
  /** Stable id used for `key` + the local /vn/ route. May be a VNDB id
   *  (`v\d+`), an `egs_<n>` synthetic id, or an EGS-only numeric id with
   *  no VNDB mapping (in which case `vndbId` is null). */
  id: string;
  /** VNDB id when known (either the row id itself, or a mapped id). */
  vndbId: string | null;
  /** Optional EGS numeric id — present on rows sourced from the EGS
   *  anticipated feed. Used to drive the Map-to-VNDB button. */
  egsId: number | null;
  title: string;
  alttitle?: string | null;
  released?: string | null;
  /** Best available cover URL (remote). */
  coverUrl: string | null;
  /** Local mirrored cover (storage relative path). */
  coverLocal?: string | null;
  /** VNDB image sexual flag, 0..2. */
  coverSexual?: number | null;
  /** True when the VN row exists in the local `collection`. Drives the
   *  visual "open local" affordance. */
  inCollection: boolean;
  /** Pre-rendered metadata strip — producers chip row, badges, EGS
   *  stats, …. Specific to each tab so we hand it in rather than try
   *  to generalise. */
  meta?: React.ReactNode;
  /** Variant: `wide` for the EGS-anticipated grid, `compact` for the
   *  release rows on the All / Collection tabs. */
  variant?: 'wide' | 'compact';
}

export function UpcomingCard({
  data,
  t,
}: {
  data: UpcomingCardData;
  t: Dictionary;
}) {
  const {
    id,
    vndbId,
    egsId,
    title,
    alttitle,
    released,
    coverUrl,
    coverLocal,
    coverSexual,
    inCollection,
    meta,
    variant = 'compact',
  } = data;

  // Resolve which VNDB id the card actually targets. Prefer the
  // explicit `vndbId`, fall back to the row id when it already looks
  // like a VNDB id.
  const resolvedVnId = vndbId ?? (/^v\d+$/i.test(id) ? id : null);
  const internalHref = resolvedVnId ? `/vn/${resolvedVnId}` : null;
  const externalHref = resolvedVnId
    ? `https://vndb.org/${resolvedVnId}`
    : egsId != null
      ? `https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${egsId}`
      : null;

  return (
    <div
      data-testid="upcoming-card"
      data-variant={variant}
      className={
        variant === 'wide'
          ? 'group flex gap-4 rounded-xl border border-border bg-bg-elev/40 p-3 transition-colors hover:border-accent sm:p-4'
          : 'flex gap-3 rounded-lg border border-border bg-bg-elev/30 p-3'
      }
    >
      <div
        className="relative shrink-0 overflow-hidden rounded"
        style={{
          width:
            variant === 'wide'
              ? 'clamp(72px, calc(var(--card-density-px, 220px) * 0.45), 220px)'
              : 'clamp(64px, calc(var(--card-density-px, 220px) * 0.42), 200px)',
          aspectRatio: '2 / 3',
        }}
      >
        {internalHref ? (
          <Link href={internalHref} className="block h-full w-full" aria-label={title}>
            <SafeImage
              src={coverUrl}
              localSrc={coverLocal ?? null}
              sexual={coverSexual ?? null}
              alt={title}
              className="h-full w-full"
            />
          </Link>
        ) : externalHref ? (
          <a
            href={externalHref}
            target="_blank"
            rel="noopener noreferrer"
            className="block h-full w-full"
            aria-label={title}
          >
            <SafeImage
              src={coverUrl}
              localSrc={coverLocal ?? null}
              sexual={coverSexual ?? null}
              alt={title}
              className="h-full w-full"
            />
          </a>
        ) : (
          <SafeImage
            src={coverUrl}
            localSrc={coverLocal ?? null}
            sexual={coverSexual ?? null}
            alt={title}
            className="h-full w-full"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          {internalHref ? (
            <Link
              href={internalHref}
              className={
                variant === 'wide'
                  ? 'line-clamp-2 text-base font-bold hover:text-accent'
                  : 'font-bold hover:text-accent'
              }
            >
              {title}
            </Link>
          ) : (
            <span
              className={
                variant === 'wide' ? 'line-clamp-2 text-base font-bold' : 'font-bold'
              }
            >
              {title}
            </span>
          )}
          {released && (
            <span className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-accent">
              {released}
            </span>
          )}
          {inCollection && (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-status-completed/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-status-completed"
              title={t.upcoming.cardInCollectionHint}
            >
              <LibraryIcon className="h-3 w-3" aria-hidden /> {t.upcoming.cardInCollection}
            </span>
          )}
        </div>
        {alttitle && alttitle !== title && (
          <div className="text-[11px] text-muted">{alttitle}</div>
        )}
        {meta && <div className="mt-1">{meta}</div>}
        <div
          className="mt-2 flex flex-wrap items-center gap-2 text-[11px]"
          data-testid="upcoming-card-actions"
        >
          {internalHref && (
            <Link
              href={internalHref}
              className="tap-target inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-muted hover:border-accent hover:text-accent"
              aria-label={t.upcoming.cardOpenLocal}
              title={t.upcoming.cardOpenLocal}
              data-affordance="open-local"
            >
              <LibraryIcon className="h-3 w-3" aria-hidden /> {t.upcoming.cardOpenLocal}
            </Link>
          )}
          {resolvedVnId && (
            <a
              href={`https://vndb.org/${resolvedVnId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="tap-target inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-muted hover:border-accent hover:text-accent"
              aria-label={t.upcoming.cardOpenVndb}
              title={t.upcoming.cardOpenVndb}
              data-affordance="open-vndb"
            >
              <ExternalLink className="h-3 w-3" aria-hidden /> VNDB
            </a>
          )}
          {egsId != null && !resolvedVnId && (
            <a
              href={`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${egsId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="tap-target inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-muted hover:border-accent hover:text-accent"
              data-affordance="open-egs"
            >
              <ExternalLink className="h-3 w-3" aria-hidden /> EGS
            </a>
          )}
          {resolvedVnId && !inCollection && (
            <span data-affordance="add-to-collection">
              <AddMissingVnButton vnId={resolvedVnId} />
            </span>
          )}
          {egsId != null && (
            <span data-affordance="map-egs-to-vndb">
              <MapEgsToVndbButton
                egsId={egsId}
                gamename={title}
                vndbId={vndbId}
                variant="compact"
              />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
