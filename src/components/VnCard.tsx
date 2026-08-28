'use client';
import { memo, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Star, BookMarked, CheckCheck, Clock, Hourglass, Building2, Check, Disc3, Loader2, MoreVertical, Package, Plus, Sparkles, X } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { SafeImage } from './SafeImage';
import { useToast } from './ToastProvider';
import { useT, useLocale } from '@/lib/i18n/client';
import { useResolvedTitle } from './TitleLine';
import { CardContextMenu } from './CardContextMenu';
import { FavoriteToggleButton } from './FavoriteToggleButton';
import { ListsPickerButton } from './ListsPickerButton';
import type { EditionType, Status } from '@/lib/types';
import type { AspectKey } from '@/lib/aspect-ratio';
import { formatMinutesOrNull as fmtMinutes } from '@/lib/format';
import { fmtNum, yearOnly } from '@/lib/locale-number';
import { readApiError } from '@/lib/api-error-read';

export interface CardData {
  id: string;
  title: string;
  alttitle?: string | null;
  poster: string | null;
  localPoster?: string | null;
  customCover?: string | null;
  sexual?: number | null;
  released: string | null;
  rating: number | null;
  user_rating?: number | null;
  playtime_minutes?: number | null;
  length_minutes?: number | null;
  status?: Status;
  editionType?: EditionType | null;
  aspectKeys?: AspectKey[] | null;
  favorite?: boolean;
  /** Whether this VN is currently in the reading queue. */
  inReadingQueue?: boolean;
  inCollectionBadge?: boolean;
  developers?: { id?: string; name: string }[];
  /**
   * Publishers credited on this VN's releases (deduped). Distinct
   * from developers per VNDB's data model - surfaced as a separate
   * chip so the user sees who DEVELOPED vs who PUBLISHED. Only
   * publishers that are not also developers are rendered, to keep
   * the chip useful (a self-publishing studio is already named in
   * the developer chip).
   */
  publishers?: { id?: string; name: string }[];
  /** ErogameScape median rating on a 0-100 scale, when available. */
  egs_median?: number | null;
  /** ErogameScape median user playtime in minutes, when available. */
  egs_playtime_minutes?: number | null;
  /**
   * True when the VN has a `relation === 'orig'` entry - VNDB's way of saying
   * "X is my original game", which only ever appears on fan discs.
   */
  isFanDisc?: boolean;
  /** Pre-computed count of user-lists this VN belongs to, for the chip. */
  listCount?: number | null;
}

interface VnCardProps {
  data: CardData;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  /** When true and the VN isn't in collection, render a hover "+ Add" button. */
  enableAdd?: boolean;
  /** Called after a successful add. Receives the VN id. */
  onAdded?: (id: string) => void;
  /** Optional badge rendered on the poster (e.g. relation type). */
  badge?: { label: string; tone?: 'accent' | 'muted' };
  /** When set, renders a hover-only "remove from wishlist" button. */
  onRemoveFromWishlist?: () => void | Promise<void>;
  /** True while this card's wishlist removal is in flight - disables the control and swaps the icon for a spinner. */
  removingFromWishlist?: boolean;
}

export const VnCard = memo(VnCardImpl);

/**
 * Inner implementation. Exported as `VnCard` (memoized) above so the
 * library grid (200+ cards) doesn't re-render every tile when a
 * single parent state ticks - every keystroke in the filter input
 * used to trigger a full grid pass.
 *
 * Memo equality is React.memo's default (referential per-prop). The
 * library passes a freshly-built `data` object from `LibraryClient`;
 * that callsite extracts the build into a stable helper so the prop
 * identity is stable across renders.
 */
function VnCardImpl({ data, selectable = false, selected = false, onSelect, enableAdd = false, onAdded, badge, onRemoveFromWishlist, removingFromWishlist = false }: VnCardProps) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [addedLocal, setAddedLocal] = useState(false);
  const [, startTransition] = useTransition();
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  // Long-press timer for touch parity: right-click is a desktop-only
  // gesture, so on phone/tablet the entire quick-actions surface is
  // unreachable without an alternate trigger. We treat a 500 ms
  // pointerdown as the touch equivalent of a context-menu event.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const identityRef = useRef<string | null>(data.id);
  const inFlightRef = useRef(false);
  const mutationAbortRef = useRef<AbortController | null>(null);

  function openMenuAt(x: number, y: number) {
    if (!data.status && !data.inCollectionBadge) return;
    setMenuAnchor({ x, y });
  }

  function onContextMenu(e: React.MouseEvent) {
    if (!data.status && !data.inCollectionBadge) return;
    e.preventDefault();
    openMenuAt(e.clientX, e.clientY);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== 'touch') return;
    if ((e.target as Element).closest('button')) return;
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      openMenuAt(e.clientX, e.clientY);
    }, 500);
  }

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  useEffect(() => () => clearLongPress(), []);
  useEffect(() => {
    identityRef.current = data.id;
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    inFlightRef.current = false;
    setAdding(false);
    setAddedLocal(false);
    setMenuAnchor(null);
    clearLongPress();
    return () => {
      identityRef.current = null;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      inFlightRef.current = false;
    };
  }, [data.id]);

  // Swallow the click that follows a fired long-press - otherwise the
  // outer <Link> navigates away the moment the menu opens.
  function onClickCapture(e: React.MouseEvent) {
    if (longPressFired.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressFired.current = false;
    }
  }
  const showAddButton = enableAdd && !selectable && !data.status && !data.inCollectionBadge && !addedLocal;
  const showAddedBadge = !selectable && !data.status && (data.inCollectionBadge || addedLocal);
  const showOverflow = (data.status || data.inCollectionBadge) && !selectable;

  async function handleAdd(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ownerVnId = data.id;
    inFlightRef.current = true;
    const controller = new AbortController();
    mutationAbortRef.current = controller;
    setAdding(true);
    try {
      const r = await fetch(`/api/collection/${ownerVnId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'planning' }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.success(t.toast.added);
      setAddedLocal(true);
      onAdded?.(ownerVnId);
      startTransition(() => router.refresh());
    } catch (err) {
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || (err instanceof Error && err.name === 'AbortError')) return;
      toast.error((err as Error).message);
    } finally {
      if (identityRef.current === ownerVnId && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        inFlightRef.current = false;
        setAdding(false);
      }
    }
  }
  const ratingNum = data.user_rating ?? data.rating;
  const rating = ratingNum != null ? fmtNum(ratingNum / 10, locale, 1) : null;
  const year = yearOnly(data.released);
  const myPlaytimeMin = data.playtime_minutes ?? null;
  const vndbLengthMin = data.length_minutes ?? null;
  const egsPlaytimeMin = data.egs_playtime_minutes ?? null;
  // "All playtime" = average of every populated source (matches the
  // library's combined_playtime sort + the PlaytimeCompare component).
  let allSum = 0;
  let allCount = 0;
  if (myPlaytimeMin && myPlaytimeMin > 0) { allSum += myPlaytimeMin; allCount++; }
  if (vndbLengthMin && vndbLengthMin > 0) { allSum += vndbLengthMin; allCount++; }
  if (egsPlaytimeMin && egsPlaytimeMin > 0) { allSum += egsPlaytimeMin; allCount++; }
  const allPlaytimeMin = allCount > 0 ? Math.round(allSum / allCount) : null;
  const myPlaytime = fmtMinutes(myPlaytimeMin, locale, t.year);
  const vndbLength = fmtMinutes(vndbLengthMin, locale, t.year);
  const egsPlaytime = fmtMinutes(egsPlaytimeMin, locale, t.year);
  const allPlaytime = fmtMinutes(allPlaytimeMin, locale, t.year);
  const egsScore = data.egs_median != null ? Math.round(data.egs_median) : null;
  const titlePair = useResolvedTitle(data.title, data.alttitle ?? null);
  const distinctAspectKeys = Array.from(new Set((data.aspectKeys ?? []).filter((key) => key !== 'unknown')));
  const visibleAspectKeys = [
    ...distinctAspectKeys.filter((key) => key !== 'other'),
    ...distinctAspectKeys.filter((key) => key === 'other'),
  ];
  const aspectLabels = visibleAspectKeys.map((key) => t.aspect.keys[key]);
  const aspectSummary = aspectLabels.length > 0
    ? `${aspectLabels[0]}${aspectLabels.length > 1 ? ` +${aspectLabels.length - 1}` : ''}`
    : null;
  const developerNames = (data.developers ?? []).map((developer) => developer.name).filter(Boolean);
  const developerIds = new Set((data.developers ?? []).map((developer) => developer.id).filter(Boolean));
  const normalizedDeveloperNames = new Set(developerNames.map((name) => name.trim().toLowerCase()));
  const publisherNames = (data.publishers ?? [])
    .filter((publisher) => (
      (!publisher.id || !developerIds.has(publisher.id)) &&
      !normalizedDeveloperNames.has(publisher.name.trim().toLowerCase())
    ))
    .map((publisher) => publisher.name)
    .filter(Boolean);

  const customCoverIsRemote = !!data.customCover && /^https?:\/\//i.test(data.customCover);
  const posterSrc = customCoverIsRemote ? data.customCover : data.poster;
  const localSrc = data.customCover
    ? customCoverIsRemote ? null : data.customCover
    : data.localPoster || null;

  const className = `group relative flex h-full w-full flex-1 flex-col overflow-hidden rounded-xl border bg-bg-card transition-all focus-within:outline-none focus-within:ring-2 focus-within:ring-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
    selectable
      ? `cursor-pointer ${selected ? 'border-accent ring-2 ring-accent shadow-card' : 'border-border hover:border-accent focus-visible:border-accent'}`
      : 'border-border can-hover:hover:-translate-y-1 hover:border-accent hover:shadow-card focus-visible:-translate-y-1 focus-visible:border-accent focus-visible:shadow-card'
  }`;

  const cover = (
    <SafeImage
      src={posterSrc}
      localSrc={localSrc}
      alt={data.title}
      sexual={data.sexual ?? null}
      className="aspect-[2/3] w-full"
    />
  );

  const details = (
    <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="line-clamp-2 text-sm font-semibold leading-tight" title={titlePair.sub ?? titlePair.main}>
          {titlePair.main}
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted" data-card-facts>
          {rating && (
            <span
              className="inline-flex items-center gap-0.5 text-accent"
              title={data.user_rating != null ? t.detail.myRatingLabel : t.detail.lengthVndb}
            >
              <Star className="h-3 w-3 fill-accent" aria-hidden /> {rating}
            </span>
          )}
          {egsScore != null && (
            <span
              className="inline-flex items-center gap-0.5 text-accent/80"
              title={`${t.egs.section} / ${t.egs.median}: ${egsScore}/100`}
            >
              <Sparkles className="h-3 w-3" aria-hidden /> {egsScore}
            </span>
          )}
          {year && <span>{year}</span>}
          {data.editionType && data.editionType !== 'none' && (
            <span className="inline-flex rounded bg-bg-elev/70 px-1.5 py-0.5 text-muted" title={t.form.editionType}>
              {t.editions[data.editionType]}
            </span>
          )}
          {aspectSummary && (
            <span
              className="inline-flex whitespace-nowrap rounded bg-bg-elev/70 px-0.5 py-0.5 text-[10px] text-muted"
              title={`${t.aspectOverride.title}: ${aspectLabels.join(' / ')}`}
            >
              {aspectSummary}
            </span>
          )}
          {/* Library card grid: no stock chip. Availability lookup lives on /stock. */}
        </div>
        {allPlaytime && (
          <div className="text-[11px]">
            <span
              className="inline-flex items-center gap-1 font-semibold text-status-playing"
              title={[
                myPlaytime ? `${t.playtime.mine}: ${myPlaytime}` : null,
                vndbLength ? `${t.playtime.vndb}: ${vndbLength}` : null,
                egsPlaytime ? `${t.playtime.egs}: ${egsPlaytime}` : null,
              ].filter(Boolean).join(' / ')}
            >
              <Clock className="h-3 w-3" aria-hidden />
              {allPlaytime}
              <span className="text-[10px] font-normal uppercase tracking-wider text-status-playing/80">
                {t.playtime.combined}
              </span>
            </span>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0 text-[10px] text-muted/80">
              {myPlaytime && (
                <span className="inline-flex items-center gap-0.5" title={t.playtime.mine}>
                  <Clock className="h-2.5 w-2.5" aria-hidden />
                  {myPlaytime}
                </span>
              )}
              {vndbLength && (
                <span className="inline-flex items-center gap-0.5" title={t.playtime.vndb}>
                  <Hourglass className="h-2.5 w-2.5" aria-hidden />
                  {vndbLength}
                </span>
              )}
              {egsPlaytime && (
                <span className="inline-flex items-center gap-0.5" title={t.playtime.egs}>
                  <Sparkles className="h-2.5 w-2.5" aria-hidden />
                  {egsPlaytime}
                </span>
              )}
            </div>
          </div>
        )}
        {(developerNames.length > 0 || publisherNames.length > 0) && (
          <div className="flex min-w-0 items-center gap-2" data-card-producers>
            {developerNames.length > 0 && (
              <div
                className="inline-flex min-w-0 flex-1 items-center gap-1 text-[11px] text-muted"
                title={`${t.detail.developers}: ${developerNames.join(', ')}`}
              >
                <Building2 className="h-3 w-3 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">
                  {developerNames[0]}
                  {developerNames.length > 1 && <span className="text-muted/70"> +{developerNames.length - 1}</span>}
                </span>
              </div>
            )}
            {publisherNames.length > 0 && (
              <div
                className="inline-flex min-w-0 flex-1 items-center gap-1 text-[11px] text-accent-blue/90"
                title={`${t.detail.publishers}: ${publisherNames.join(', ')}`}
              >
                <Package className="h-3 w-3 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">
                  {publisherNames[0]}
                  {publisherNames.length > 1 && <span className="text-accent-blue/70"> +{publisherNames.length - 1}</span>}
                </span>
              </div>
            )}
          </div>
        )}
    </div>
  );

  const actions = (
    <>
      {(data.status || data.inCollectionBadge || data.favorite) && (
        <FavoriteToggleButton
          vnId={data.id}
          initial={!!data.favorite}
          inCollection={!!(data.status || data.inCollectionBadge)}
        />
      )}
      <ListsPickerButton vnId={data.id} initialMemberCount={data.listCount ?? 0} />
      {onRemoveFromWishlist && (
        <button
          type="button"
          onClick={() => void onRemoveFromWishlist()}
          disabled={removingFromWishlist}
          title={t.wishlist.removeOne}
          aria-label={t.wishlist.removeOne}
          className="card-action-overlay card-action-touch absolute left-2 top-14 z-30 text-bg disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="card-action-visual bg-status-dropped/90">
            {removingFromWishlist ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
          </span>
        </button>
      )}
      {showAddButton && (
        <button
          type="button"
          onClick={handleAdd}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleAdd(e);
          }}
          disabled={adding}
          className="card-action-overlay pointer-events-auto absolute right-2 top-2 z-30 inline-flex min-h-[44px] min-w-[44px] items-center justify-center bg-transparent text-[11px] font-bold text-bg disabled:opacity-50 can-hover:sm:min-h-7 can-hover:sm:min-w-0"
          title={t.form.add}
        >
          <span className="card-action-visual gap-1 bg-accent/90 px-2">
            <span className="inline-flex h-3 w-3 items-center justify-center">
              {adding ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Plus className="h-3 w-3" aria-hidden />}
            </span>
            {t.cardAdd}
          </span>
        </button>
      )}
    </>
  );

  const coverOverlay = (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 aspect-[2/3]">
      {selectable && (
        <span
          className={`absolute left-2 top-2 z-20 flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
            selected ? 'border-accent bg-accent text-bg' : 'border-white/60 bg-bg-card/80 text-transparent'
          }`}
          aria-hidden
        >
          <Check className="h-3 w-3" aria-hidden />
        </span>
      )}
      {selectable && data.favorite && (
        <>
          <Star className="absolute right-2 top-2 z-10 h-5 w-5 fill-accent text-accent drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]" aria-hidden />
          <span className="sr-only">{t.form.favorite}</span>
        </>
      )}
      {data.inReadingQueue && (
        <>
          <BookMarked
            className={`absolute left-2 z-10 h-4 w-4 fill-accent/80 text-accent drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)] ${badge ? 'bottom-10' : 'bottom-2'}`}
            aria-hidden
          />
          <span className="sr-only">{t.library.moreFilters.inReadingQueue}</span>
        </>
      )}
      {!selectable && data.status && (
        <div className="absolute right-2 top-2 z-10 flex max-w-[calc(100%_-_4rem)]">
          <StatusBadge status={data.status} className="max-w-full [&>span]:min-w-0 [&>span]:truncate" />
        </div>
      )}
      {!selectable && showAddedBadge && (
        <span className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md bg-status-completed px-2 py-0.5 text-[11px] font-bold text-bg">
          <CheckCheck className="h-3 w-3" aria-hidden />
          {t.search.inCollection}
        </span>
      )}
      {badge && (
        <span
          className={`absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-card ${
            badge.tone === 'muted'
              ? 'bg-bg-card/90 text-muted backdrop-blur'
              : 'bg-accent text-bg'
          }`}
        >
          {badge.label}
        </span>
      )}
      {data.isFanDisc && (
        <span
          className={`absolute right-2 z-10 inline-flex items-center gap-1 rounded-md bg-accent-blue/85 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bg shadow-card backdrop-blur ${showOverflow ? 'bottom-14' : 'bottom-2'}`}
          title={t.library.fanDiscHint}
        >
          <Disc3 className="h-3 w-3" aria-hidden />
          {t.library.fanDisc}
        </span>
      )}
      {!selectable && actions}
      {showOverflow && (
        <button
          type="button"
          aria-label={t.quickActions.title}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
            openMenuAt(rect.right, rect.bottom);
          }}
          className="card-action-touch absolute bottom-2 right-2 z-30 text-muted hover:text-white sm:hidden"
        >
          <span className="card-action-visual bg-bg-card/90">
            <MoreVertical className="h-4 w-4" aria-hidden />
          </span>
        </button>
      )}
    </div>
  );

  if (selectable) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-pressed={!!selected}
        aria-label={data.title}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect?.();
          }
        }}
        className={className}
      >
        {cover}
        {details}
        {coverOverlay}
      </div>
    );
  }

  return (
    <>
      <div
        className={className}
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        onPointerUp={clearLongPress}
        onPointerLeave={clearLongPress}
        onPointerCancel={clearLongPress}
        onClickCapture={onClickCapture}
      >
        <div className="relative">
          {cover}
          <Link
            href={`/vn/${data.id}`}
            prefetch={false}
            tabIndex={-1}
            aria-hidden="true"
            className="absolute inset-0 z-10"
          >
            <span className="sr-only">{titlePair.main}</span>
          </Link>
        </div>
        <Link href={`/vn/${data.id}`} prefetch={false} className="flex min-h-0 flex-1 flex-col focus-visible:outline-none">
          {details}
        </Link>
        {coverOverlay}
      </div>
      {menuAnchor && (
        <CardContextMenu
          vnId={data.id}
          status={data.status ?? null}
          favorite={!!data.favorite}
          developer={data.developers?.[0] ?? null}
          publisher={
            (data.publishers ?? []).find(
              (p) => !(data.developers ?? []).some((d) => d.id && p.id && d.id === p.id),
            ) ?? null
          }
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
        />
      )}
    </>
  );
}
