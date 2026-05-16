'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, Box, CircleDollarSign, ExternalLink, Info, MapPin } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

/**
 * Data needed to render the popover. Strict subset of `ShelfEntry`
 * + the `rel_*` columns now LEFT-JOINed onto `ShelfSlotEntry` /
 * `ShelfDisplaySlotEntry`. Owned-edition fields (condition, box_type,
 * physical_location, price, acquired_date, dumped) are optional so
 * shelf-slot/display contexts that don't carry every field (notes,
 * acquired_date) still render gracefully.
 *
 * Owned-platform is the user-picked physical-SKU pin introduced
 * alongside this popover; rendered as the most-important per-edition
 * fact when set, taking precedence over the wider rel_platforms.
 */
export interface EditionInfoPopoverData {
  vn_id: string;
  release_id: string;
  vn_title: string;
  vn_image_thumb: string | null;
  vn_image_url: string | null;
  vn_local_image_thumb: string | null;
  vn_image_sexual: number | null;
  /** Per-edition pin (lowercase VNDB code). Beats rel_platforms. */
  owned_platform: string | null;
  edition_label: string | null;
  box_type: string;
  condition: string | null;
  physical_location: string[];
  price_paid: number | null;
  currency: string | null;
  acquired_date: string | null;
  dumped: boolean;
  /** VN-aggregate fallback used only when rel_* is empty. */
  vn_platforms: string[];
  vn_languages: string[];
  vn_released: string | null;
  rel_title: string | null;
  rel_platforms: string[];
  rel_languages: string[];
  rel_released: string | null;
  rel_resolution: string | null;
}

/**
 * Compact Info button + collision-aware popover for a single owned
 * edition. The popover surfaces every release-level fact (preferring
 * `rel_*` over `vn_*`) plus owned-release annotations. Used by:
 *   - <DraggablePoolItem> on `/shelf?view=layout` (unplaced editions).
 *   - <DraggableSlotItem> on the same page (placed cells).
 *   - <DraggableDisplayItem> on the same page (face-out display rows).
 * The same trigger could be reused inside the read-only spatial view
 * once those server cards gain a client island.
 *
 * Behavior contract (lifted from the original pool-item popover; the
 * user reported a brief mis-position flash when collision detection
 * ran AFTER the popover painted):
 *   1. Open state is internal — parent only provides data.
 *   2. Default placement: below + left.
 *   3. On open, requestAnimationFrame measures the popover height /
 *      width against the anchor's bounding rect; flips vertical when
 *      space below < popHeight + 12 AND space above > space below;
 *      flips horizontal when (viewportW - tile.left) < popWidth + 12.
 *   4. Recomputes on scroll / resize (passive listeners).
 *   5. Until the first measure-and-flip completes, the popover is
 *      `invisible opacity-0` so the user never sees the brief
 *      mis-position frame.
 *   6. Pointer events on the trigger and popover stop propagation so
 *      opening the popover does NOT initiate a dnd-kit drag from
 *      the parent's drag surface.
 *   7. Outside-click + Escape close.
 */
export function EditionInfoTrigger({
  data,
  ariaLabelOverride,
  buttonClassName = '',
  buttonPositionClassName = 'absolute right-1 top-1',
  /**
   * When true, the trigger button is hidden until the parent is
   * hovered or focused. Used on the touch-friendly pool tiles
   * (always visible) vs. the cell/display tiles (revealed on hover
   * to keep the cover image dominant). Defaults to false for the
   * pool tiles' "always tappable" affordance.
   */
  groupHoverHidden = false,
  groupHoverScope = 'group',
}: {
  data: EditionInfoPopoverData;
  ariaLabelOverride?: string;
  buttonClassName?: string;
  buttonPositionClassName?: string;
  groupHoverHidden?: boolean;
  groupHoverScope?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<{
    vertical: 'below' | 'above';
    horizontal: 'left' | 'right';
  }>({ vertical: 'below', horizontal: 'left' });
  const [placed, setPlaced] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Outside-click + Escape close. Container check spans the button
  // + the popover (both rendered as siblings into the parent's
  // positioning context).
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !buttonRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Measure-and-flip on open + on scroll/resize while open.
  useEffect(() => {
    if (!open) {
      setPlaced(false);
      return;
    }
    if (typeof window === 'undefined') return;
    // CRITICAL: measure against the same element the popover
    // anchors against. The popover uses `absolute` with
    // `top-full`/`bottom-full` + `left-0`/`right-0`, which resolves
    // relative to the nearest positioned ancestor (`offsetParent`).
    // Measuring against the small `h-6 w-6` button silently
    // overestimates the space below because the popover actually
    // paints at parent.bottom, not button.bottom — that was the
    // root cause of the bottom-overflow regression: a tile near
    // the bottom of the page had ~80px below the button but only
    // ~10px below the parent tile, so the flip never triggered.
    const button = buttonRef.current;
    const popover = popoverRef.current;
    if (!button || !popover) return;
    const anchor = (button.offsetParent as HTMLElement | null) ?? button;
    const compute = () => {
      const tileRect = anchor.getBoundingClientRect();
      const popHeight = popover.offsetHeight;
      const popWidth = popover.offsetWidth;
      const viewportH = window.innerHeight;
      const viewportW = window.innerWidth;
      const spaceBelow = viewportH - tileRect.bottom;
      const spaceAbove = tileRect.top;
      const vertical: 'below' | 'above' =
        spaceBelow < popHeight + 12 && spaceAbove > spaceBelow ? 'above' : 'below';
      const spaceRight = viewportW - tileRect.left;
      const horizontal: 'left' | 'right' = spaceRight < popWidth + 12 ? 'right' : 'left';
      setPlacement({ vertical, horizontal });
      setPlaced(true);
    };
    const raf = requestAnimationFrame(compute);
    window.addEventListener('scroll', compute, { passive: true });
    window.addEventListener('resize', compute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', compute);
      window.removeEventListener('resize', compute);
    };
  }, [open]);

  function stop(e: React.SyntheticEvent) {
    e.stopPropagation();
  }
  const isSynthetic = data.release_id.startsWith('synthetic:');
  const ariaLabel = ariaLabelOverride ?? t.shelfLayout.poolItemDetails;
  // Hover-reveal opacity class — when groupHoverHidden, parents
  // pass their own group scope (e.g. `group/slot`, `group/display`)
  // so the button only fades in on direct hover, not on adjacent
  // tiles. Falls back to always-visible for the pool variant where
  // discoverability outweighs visual minimalism on the unplaced
  // grid (and where the tap target needs to be obvious on touch).
  const hoverOpacityClass = groupHoverHidden
    ? `focus-visible:opacity-100 sm:opacity-0 sm:${groupHoverScope}-hover:opacity-100`
    : '';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onPointerDown={stop}
        onMouseDown={stop}
        onClick={(e) => {
          stop(e);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-label={ariaLabel}
        title={ariaLabel}
        className={`${buttonPositionClassName} inline-flex h-6 w-6 items-center justify-center rounded bg-bg/80 text-muted hover:text-accent ${hoverOpacityClass} ${buttonClassName}`}
      >
        <Info className="h-3 w-3" aria-hidden />
      </button>
      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={ariaLabel}
          onPointerDown={stop}
          onMouseDown={stop}
          className={`absolute z-30 w-max min-w-[200px] max-w-[280px] rounded-lg border border-border bg-bg-card p-2 text-[11px] shadow-card ${
            placement.vertical === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'
          } ${placement.horizontal === 'right' ? 'right-0' : 'left-0'} ${
            placed ? 'visible opacity-100' : 'invisible opacity-0'
          }`}
        >
          <p className="line-clamp-2 text-xs font-bold">{data.vn_title}</p>
          {data.rel_title && data.rel_title !== data.vn_title && (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted">{data.rel_title}</p>
          )}
          {data.edition_label && (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted">{data.edition_label}</p>
          )}
          {/*
            Prefer release-level metadata (rel_*) when materialized;
            fall back to VN-level aggregate (vn_*) only when the
            release has not been harvested into release_meta_cache.
            owned_platform takes precedence over rel_platforms when
            set so the user's explicit pin always wins.
          */}
          <dl className="mt-1 grid grid-cols-1 gap-x-2 gap-y-0.5 text-[10px] text-muted">
            <div>
              <span className="font-mono">{data.release_id}</span>
            </div>
            {/*
              Platform row — strict priority chain spelled out so
              the aggregate VN/release platforms list is NEVER shown
              as "the owned platform". The user's manual QA flagged
              the case where a multi-platform release without a pin
              leaked all four platforms into the row labelled
              "Platforms:".

              Priority (matches Blocker 3 spec):
                1. explicit owned_release.owned_platform           → show that
                2. exact release has exactly one platform          → show that, with "release" badge
                3. multi-platform release, owned_platform unset    → show "Platform not specified" + hint
                4. release metadata missing                         → show "Unknown platform" hint
            */}
            {(() => {
              if (data.owned_platform) {
                return (
                  <div>
                    {t.form.ownedPlatform}:{' '}
                    <span className="text-white">{data.owned_platform.toUpperCase()}</span>
                    <span className="ml-1 rounded bg-accent/20 px-1 text-[9px] uppercase text-accent">
                      {t.shelfLayout.ownedBadge}
                    </span>
                  </div>
                );
              }
              if (data.rel_platforms.length === 1) {
                return (
                  <div>
                    {t.form.ownedPlatform}:{' '}
                    <span className="text-white">{data.rel_platforms[0].toUpperCase()}</span>
                    <span className="ml-1 rounded bg-bg-elev/40 px-1 text-[9px] uppercase opacity-70">
                      {t.shelfLayout.releaseFieldBadge}
                    </span>
                  </div>
                );
              }
              if (data.rel_platforms.length > 1) {
                return (
                  <div>
                    {t.form.ownedPlatform}:{' '}
                    <span className="text-status-on_hold">{t.form.ownedPlatformUnset}</span>
                    <span
                      className="ml-1 text-[10px] opacity-70"
                      title={data.rel_platforms.join(' · ').toUpperCase()}
                    >
                      ({t.shelfLayout.releaseHasOptions.replace('{n}', String(data.rel_platforms.length))})
                    </span>
                  </div>
                );
              }
              // Release metadata not materialized yet — never
              // widen to vn_platforms here. The user can refresh
              // the VN's releases or set owned_platform manually.
              return (
                <div>
                  {t.form.ownedPlatform}:{' '}
                  <span className="text-muted">{t.shelfLayout.platformUnknown}</span>
                </div>
              );
            })()}
            {(() => {
              const released = data.rel_released ?? data.vn_released;
              if (!released) return null;
              return (
                <div>
                  {t.detail.released}:{' '}
                  <span className="text-white tabular-nums">{released}</span>
                  {data.rel_released && (
                    <span className="ml-1 rounded bg-bg-elev/40 px-1 text-[9px] uppercase opacity-70">
                      {t.shelfLayout.releaseFieldBadge}
                    </span>
                  )}
                </div>
              );
            })()}
            {(() => {
              const langs = data.rel_languages.length > 0 ? data.rel_languages : data.vn_languages;
              if (langs.length === 0) return null;
              return (
                <div>
                  {t.detail.languages}:{' '}
                  <span className="text-white">{langs.join(' · ').toUpperCase()}</span>
                  {data.rel_languages.length > 0 && (
                    <span className="ml-1 rounded bg-bg-elev/40 px-1 text-[9px] uppercase opacity-70">
                      {t.shelfLayout.releaseFieldBadge}
                    </span>
                  )}
                </div>
              );
            })()}
            {data.rel_resolution && (
              <div>
                {t.detail.aspectLabel}:{' '}
                <span className="text-white tabular-nums">{data.rel_resolution}</span>
              </div>
            )}
            {data.condition && (
              <div>
                {t.inventory.condition}:{' '}
                <span className="text-white">
                  {(t.inventory.conditions as Record<string, string>)[data.condition] ?? data.condition}
                </span>
              </div>
            )}
            {data.box_type !== 'none' && (
              <div className="inline-flex items-center gap-1">
                <Box className="h-2.5 w-2.5" aria-hidden />
                {(t.boxTypes as Record<string, string>)[data.box_type] ?? data.box_type}
              </div>
            )}
            {data.physical_location.length > 0 && (
              <div className="inline-flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" aria-hidden />
                <span className="text-white">{data.physical_location.join(' · ')}</span>
              </div>
            )}
            {data.price_paid != null && (
              <div className="inline-flex items-center gap-1 text-accent">
                <CircleDollarSign className="h-2.5 w-2.5" aria-hidden />
                {data.price_paid.toLocaleString()} {data.currency ?? ''}
              </div>
            )}
            {data.acquired_date && (
              <div>
                {t.inventory.acquired}: <span className="text-white">{data.acquired_date}</span>
              </div>
            )}
            {data.dumped && (
              <div className="text-status-completed">
                <ArrowDown className="mr-0.5 inline h-2.5 w-2.5" aria-hidden />
                {t.shelf.dumped}
              </div>
            )}
          </dl>
          <div className="mt-2 flex flex-wrap gap-1">
            <Link
              href={`/vn/${data.vn_id}`}
              onPointerDown={stop}
              onMouseDown={stop}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded border border-border bg-bg-elev/50 px-1.5 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
            >
              <ExternalLink className="h-2.5 w-2.5" aria-hidden />
              {t.shelfLayout.poolOpenVn}
            </Link>
            {!isSynthetic && (
              <Link
                href={`/release/${data.release_id}`}
                onPointerDown={stop}
                onMouseDown={stop}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded border border-border bg-bg-elev/50 px-1.5 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
              >
                <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                {t.shelfLayout.poolOpenRelease}
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
