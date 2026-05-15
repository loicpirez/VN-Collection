'use client';
import { memo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Star, CheckCheck, Clock, Hourglass, Building2, Check, Disc3, Loader2, MoreVertical, Package, Plus, Sparkles, X } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { SafeImage } from './SafeImage';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';
import { useResolvedTitle } from './TitleLine';
import { CardContextMenu } from './CardContextMenu';
import { FavoriteToggleButton } from './FavoriteToggleButton';
import { ListsPickerButton } from './ListsPickerButton';
import type { Status } from '@/lib/types';

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
  favorite?: boolean;
  inCollectionBadge?: boolean;
  developers?: { id?: string; name: string }[];
  /**
   * Publishers credited on this VN's releases (deduped). Distinct
   * from developers per VNDB's data model — surfaced as a separate
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
   * True when the VN has a `relation === 'orig'` entry — VNDB's way of saying
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
}

function fmtMinutes(m: number | null | undefined): string | null {
  if (m == null || m <= 0) return null;
  const h = Math.floor(m / 60);
  const mn = m % 60;
  if (h && mn) return `${h}h ${mn}m`;
  if (h) return `${h}h`;
  return `${mn}m`;
}

export const VnCard = memo(VnCardImpl);

/**
 * Inner implementation. Exported as `VnCard` (memoized) above so the
 * library grid (200+ cards) doesn't re-render every tile when a
 * single parent state ticks — every keystroke in the filter input
 * used to trigger a full grid pass.
 *
 * Memo equality is React.memo's default (referential per-prop). The
 * library passes a freshly-built `data` object from `LibraryClient`;
 * that callsite extracts the build into a stable helper so the prop
 * identity is stable across renders.
 */
function VnCardImpl({ data, selectable = false, selected = false, onSelect, enableAdd = false, onAdded, badge, onRemoveFromWishlist }: VnCardProps) {
  const t = useT();
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

  function openMenuAt(x: number, y: number) {
    if (selectable) return;
    if (!data.status && !data.inCollectionBadge) return;
    setMenuAnchor({ x, y });
  }

  function onContextMenu(e: React.MouseEvent) {
    if (selectable) return;
    if (!data.status && !data.inCollectionBadge) return;
    e.preventDefault();
    openMenuAt(e.clientX, e.clientY);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== 'touch') return;
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

  // Swallow the click that follows a fired long-press — otherwise the
  // outer <Link> navigates away the moment the menu opens.
  function onClickCapture(e: React.MouseEvent) {
    if (longPressFired.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressFired.current = false;
    }
  }
  const showAddButton = enableAdd && !selectable && !data.status && !data.inCollectionBadge && !addedLocal;
  const showAddedBadge = enableAdd && !selectable && (data.inCollectionBadge || addedLocal);

  async function handleAdd(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (adding) return;
    setAdding(true);
    try {
      const r = await fetch(`/api/collection/${data.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'planning' }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || t.common.error);
      }
      toast.success(t.toast.added);
      setAddedLocal(true);
      onAdded?.(data.id);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAdding(false);
    }
  }
  const ratingNum = data.user_rating ?? data.rating;
  const rating = ratingNum != null ? (ratingNum / 10).toFixed(1) : null;
  const year = data.released?.slice(0, 4);
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
  const myPlaytime = fmtMinutes(myPlaytimeMin);
  const vndbLength = fmtMinutes(vndbLengthMin);
  const egsPlaytime = fmtMinutes(egsPlaytimeMin);
  const allPlaytime = fmtMinutes(allPlaytimeMin);
  const egsScore = data.egs_median != null ? Math.round(data.egs_median) : null;
  const titlePair = useResolvedTitle(data.title, data.alttitle ?? null);

  const localSrc = data.customCover || data.localPoster || null;

  const className = `group relative flex flex-col overflow-hidden rounded-xl border bg-bg-card transition-all ${
    selectable
      ? `cursor-pointer ${selected ? 'border-accent ring-2 ring-accent shadow-card' : 'border-border hover:border-accent'}`
      : 'border-border hover:-translate-y-1 hover:border-accent hover:shadow-card'
  }`;

  const inner = (
    <>
      {selectable && (
        <span
          className={`absolute left-2 top-2 z-20 flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
            selected ? 'border-accent bg-accent text-bg' : 'border-white/60 bg-bg-card/80 text-transparent'
          }`}
          aria-hidden
        >
          <Check className="h-3 w-3" />
        </span>
      )}
      {selectable && data.favorite && (
        <Star
          aria-label="favorite"
          className="absolute right-2 top-2 z-10 h-5 w-5 fill-accent text-accent drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]"
        />
      )}
      {!selectable && (data.status || data.inCollectionBadge || data.favorite) && (
        <FavoriteToggleButton
          vnId={data.id}
          initial={!!data.favorite}
          inCollection={!!(data.status || data.inCollectionBadge)}
        />
      )}
      {!selectable && (
        <ListsPickerButton vnId={data.id} initialMemberCount={data.listCount ?? 0} />
      )}
      {!selectable && data.status && (
        <div className="absolute right-2 top-2 z-10">
          <StatusBadge status={data.status} />
        </div>
      )}
      {!selectable && (showAddedBadge) && (
        <span className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md bg-status-completed px-2 py-0.5 text-[11px] font-bold text-bg">
          <CheckCheck className="h-3 w-3" aria-hidden />
          {t.search.inCollection}
        </span>
      )}
      {!selectable && onRemoveFromWishlist && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void onRemoveFromWishlist();
          }}
          title={t.wishlist.removeOne}
          aria-label={t.wishlist.removeOne}
          className="absolute left-2 top-11 z-30 inline-flex h-7 w-7 items-center justify-center rounded-md bg-status-dropped/90 text-bg shadow-card hover:bg-status-dropped md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
      {badge && (
        <span
          className={`absolute bottom-[calc(33%+0.5rem)] left-2 z-10 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-card ${
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
          className="absolute bottom-[calc(33%+0.5rem)] right-2 z-10 inline-flex items-center gap-1 rounded-md bg-accent-blue/85 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-bg shadow-card backdrop-blur"
          title={t.library.fanDiscHint}
        >
          <Disc3 className="h-3 w-3" aria-hidden />
          {t.library.fanDisc}
        </span>
      )}
      {!selectable && showAddButton && (
        <button
          type="button"
          onClick={handleAdd}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleAdd(e);
          }}
          disabled={adding}
          className="absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-md bg-accent/90 px-2 py-0.5 text-[11px] font-bold text-bg shadow-card transition-opacity hover:bg-accent disabled:opacity-50 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
          title={t.form.add}
        >
          {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          {t.cardAdd}
        </button>
      )}
      <SafeImage
        src={data.poster}
        localSrc={localSrc}
        alt={data.title}
        sexual={data.sexual ?? null}
        className="aspect-[2/3] w-full"
      />
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="line-clamp-2 text-sm font-semibold leading-tight" title={titlePair.sub ?? titlePair.main}>
          {titlePair.main}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
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
              title={`${t.egs.section} · ${t.egs.median}: ${egsScore}/100`}
            >
              <Sparkles className="h-3 w-3" aria-hidden /> {egsScore}
            </span>
          )}
          {year && <span>{year}</span>}
        </div>
        {allPlaytime && (
          <div className="text-[11px]">
            <span
              className="inline-flex items-center gap-1 font-semibold text-status-playing"
              title={[
                myPlaytime ? `${t.playtime.mine}: ${myPlaytime}` : null,
                vndbLength ? `${t.playtime.vndb}: ${vndbLength}` : null,
                egsPlaytime ? `${t.playtime.egs}: ${egsPlaytime}` : null,
              ].filter(Boolean).join(' · ')}
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
        {data.developers && data.developers.length > 0 && (() => {
          // Show only the primary developer name with a "+N" suffix
          // when there are more — comma-joining the whole list got
          // truncated to the first ~6 visible characters on dense
          // grids, which was useless ("Type-Moon..." or worse).
          const names = data.developers.map((d) => d.name).filter(Boolean);
          const primary = names[0];
          const extra = names.length - 1;
          return (
            <div
              className="inline-flex items-center gap-1 text-[11px] text-muted"
              title={`${t.detail.developers}: ${names.join(', ')}`}
            >
              <Building2 className="h-3 w-3 shrink-0" aria-hidden />
              <span className="line-clamp-1">
                {primary}
                {extra > 0 && <span className="text-muted/70"> +{extra}</span>}
              </span>
            </div>
          );
        })()}
        {(() => {
          // Publishers that are ALSO developers are dropped — they're
          // already represented in the developer chip above. Showing
          // them twice would just waste a row on every self-published
          // studio (Type-Moon, Key, …). Dedup normalises trim + case
          // because VNDB occasionally returns names with trailing
          // whitespace ("Type-Moon ").
          if (!data.publishers || data.publishers.length === 0) return null;
          const norm = (s: string) => s.trim().toLowerCase();
          const devIds = new Set((data.developers ?? []).map((d) => d.id).filter(Boolean));
          const devNames = new Set((data.developers ?? []).map((d) => norm(d.name)));
          const distinct = data.publishers.filter(
            (p) => (!p.id || !devIds.has(p.id)) && !devNames.has(norm(p.name)),
          );
          if (distinct.length === 0) return null;
          const primary = distinct[0].name;
          const extra = distinct.length - 1;
          return (
            <div
              className="inline-flex items-center gap-1 text-[11px] text-accent-blue/90"
              title={`${t.detail.publishers}: ${distinct.map((p) => p.name).join(', ')}`}
            >
              <Package className="h-3 w-3 shrink-0" aria-hidden />
              <span className="line-clamp-1">
                {primary}
                {extra > 0 && <span className="text-accent-blue/70"> +{extra}</span>}
              </span>
            </div>
          );
        })()}
      </div>
    </>
  );

  if (selectable) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect?.();
          }
        }}
        className={className}
      >
        {inner}
      </div>
    );
  }

  // Touch-visible overflow button: same surface as the right-click
  // menu, since touch devices can't trigger contextmenu. Hidden on
  // sm+ where right-click is the expected gesture.
  const showOverflow = (data.status || data.inCollectionBadge) && !selectable;

  return (
    <>
      <Link
        href={`/vn/${data.id}`}
        className={className}
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        onPointerUp={clearLongPress}
        onPointerLeave={clearLongPress}
        onPointerCancel={clearLongPress}
        onClickCapture={onClickCapture}
      >
        {inner}
        {showOverflow && (
          <button
            type="button"
            aria-label={t.quickActions.title}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
              openMenuAt(rect.right, rect.bottom);
            }}
            className="absolute bottom-2 right-2 z-30 inline-flex h-7 w-7 items-center justify-center rounded-md bg-bg-card/90 text-muted shadow-card backdrop-blur hover:text-white sm:hidden"
          >
            <MoreVertical className="h-4 w-4" aria-hidden />
          </button>
        )}
      </Link>
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
