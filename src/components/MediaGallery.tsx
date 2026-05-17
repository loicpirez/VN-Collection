'use client';
import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink as ExternalLinkIcon,
  ImageDown,
  ImageUp,
  Maximize2,
  MoreHorizontal,
  RotateCcw,
  RotateCw,
  X,
} from 'lucide-react';
import { useDialogA11y } from './Dialog';
import {
  MEDIA_MENU_MAX_WIDTH_REM,
  MEDIA_MENU_MIN_WIDTH_REM,
  decideMediaMenuHorizontal,
} from './media-menu-helpers';
import { PortalPopover } from './PortalPopover';
import { SafeImage } from './SafeImage';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { dispatchBannerChanged, dispatchCoverChanged } from '@/lib/cover-banner-events';
import type { ReleaseImage, Screenshot } from '@/lib/types';

export interface MediaItem {
  key: string;
  url: string;
  thumbnail?: string | null;
  local?: string | null;
  local_thumb?: string | null;
  sexual?: number | null;
  alt: string;
  caption?: string | null;
  /** narrow → screenshots are landscape, package is portrait/square */
  aspect?: 'portrait' | 'landscape' | 'square';
  /** Native dimensions, when VNDB reports them. */
  dims?: [number, number] | null;
}

const TYPE_KEYS = ['all', 'pkgfront', 'pkgback', 'pkgcontent', 'pkgside', 'pkgmed', 'dig', 'screenshots'] as const;
type TypeKey = (typeof TYPE_KEYS)[number];

export function MediaGallery({
  vnId,
  screenshots,
  releaseImages,
}: {
  vnId: string;
  screenshots: Screenshot[];
  releaseImages: ReleaseImage[];
}) {
  const t = useT();
  const [filter, setFilter] = useState<TypeKey>('all');
  const [active, setActive] = useState<number | null>(null);

  const groups = useMemo<Record<Exclude<TypeKey, 'all'>, MediaItem[]>>(() => {
    const out: Record<Exclude<TypeKey, 'all'>, MediaItem[]> = {
      pkgfront: [],
      pkgback: [],
      pkgcontent: [],
      pkgside: [],
      pkgmed: [],
      dig: [],
      screenshots: screenshots.map((s, i) => ({
        key: `sc-${i}`,
        url: s.url,
        thumbnail: s.thumbnail,
        local: s.local,
        local_thumb: s.local_thumb,
        sexual: s.sexual ?? null,
        alt: `${t.media.screenshots} ${i + 1}`,
        aspect: 'landscape',
        dims: s.dims ?? null,
      })),
    };
    for (const img of releaseImages) {
      const typeKey = img.type.toLowerCase() as keyof typeof t.media;
      const localizedType =
        typeKey in t.media && typeof t.media[typeKey] === 'string' ? t.media[typeKey] : img.type;
      const item: MediaItem = {
        key: `${img.release_id}-${img.id ?? img.url}`,
        url: img.url,
        thumbnail: img.thumbnail ?? null,
        local: img.local ?? null,
        local_thumb: img.local_thumb ?? null,
        sexual: img.sexual ?? null,
        alt: `${localizedType} — ${img.release_title}`,
        caption: img.release_title,
        aspect: img.type === 'pkgmed' ? 'square' : 'portrait',
        dims: img.dims ?? null,
      };
      out[img.type].push(item);
    }
    return out;
  }, [screenshots, releaseImages, t]);

  const visible = useMemo<MediaItem[]>(() => {
    if (filter === 'all') {
      return [
        ...groups.pkgfront,
        ...groups.pkgback,
        ...groups.pkgcontent,
        ...groups.pkgside,
        ...groups.pkgmed,
        ...groups.dig,
        ...groups.screenshots,
      ];
    }
    return groups[filter] ?? [];
  }, [filter, groups]);

  if (
    screenshots.length === 0 &&
    releaseImages.length === 0
  ) {
    return null;
  }

  const counts: Record<TypeKey, number> = {
    all: screenshots.length + releaseImages.length,
    pkgfront: groups.pkgfront.length,
    pkgback: groups.pkgback.length,
    pkgcontent: groups.pkgcontent.length,
    pkgside: groups.pkgside.length,
    pkgmed: groups.pkgmed.length,
    dig: groups.dig.length,
    screenshots: groups.screenshots.length,
  };

  const close = () => setActive(null);
  const prev = () => setActive((a) => (a == null ? null : (a - 1 + visible.length) % visible.length));
  const next = () => setActive((a) => (a == null ? null : (a + 1) % visible.length));

  const lightboxRef = useRef<HTMLDivElement | null>(null);
  const lightboxTitleId = useId();
  useDialogA11y({ open: active != null, onClose: close, panelRef: lightboxRef });

  // Arrow-key navigation in the lightbox so the user can flip through
  // images without reaching for the mouse. ESC handled by useDialogA11y.
  useEffect(() => {
    if (active == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  return (
    <div aria-label={t.media.section}>
      {/*
        The chip row is a single-selection filter — `role="tablist"`
        with `aria-pressed` on each chip is the closest WAI-ARIA
        pattern for a chip filter that doesn't switch underlying
        documents (no need for `tabpanel`). SR users used to hear
        a row of generic "button" labels with no state.
      */}
      <div
        className="mb-4 flex flex-wrap gap-1.5"
        role="group"
        aria-label={t.media.filtersLabel}
      >
        {TYPE_KEYS.filter((k) => counts[k] > 0).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={filter === k}
            className={`chip ${filter === k ? 'chip-active' : ''}`}
            onClick={() => setFilter(k)}
          >
            {t.media[k]} <span className="ml-1 opacity-70">{counts[k]}</span>
          </button>
        ))}
      </div>

      <div
        className="grid gap-2"
        // Thumbnail grid now reads the same `--card-density-px`
        // variable every listing page mounts (scoped via
        // `density.vnMedia` in the slider). The previous fixed
        // 140px ignored the slider entirely on the VN detail page,
        // so users that dial density up for /library still got the
        // packed 140px grid on the Médias section.
        style={{
          gridTemplateColumns:
            'repeat(auto-fill, minmax(min(100%, calc(var(--card-density-px, 220px) * 0.65)), 1fr))',
        }}
        role="list"
        aria-label={t.media.itemsLabel}
      >
        {visible.map((item, i) => (
          <MediaTile
            key={item.key}
            item={item}
            vnId={vnId}
            onOpenLightbox={() => setActive(i)}
          />
        ))}
      </div>

      {active != null && visible[active] && (
        <div
          ref={lightboxRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={lightboxTitleId}
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 outline-none"
          onClick={close}
        >
          <h2 id={lightboxTitleId} className="sr-only">
            {visible[active].alt}
          </h2>
          <button
            className="absolute right-4 top-4 tap-target inline-flex h-11 w-11 items-center justify-center rounded-full bg-bg-card text-white"
            onClick={(e) => { e.stopPropagation(); close(); }}
            aria-label={t.common.close}
          >
            <X className="h-5 w-5" />
          </button>
          {visible.length > 1 && (
            <>
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 tap-target inline-flex h-11 w-11 items-center justify-center rounded-full bg-bg-card text-white"
                onClick={(e) => { e.stopPropagation(); prev(); }}
                aria-label={t.common.prev}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 tap-target inline-flex h-11 w-11 items-center justify-center rounded-full bg-bg-card text-white"
                onClick={(e) => { e.stopPropagation(); next(); }}
                aria-label={t.common.next}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
          <div className="relative max-h-[90vh] max-w-[95vw]" onClick={(e) => e.stopPropagation()}>
            <SafeImage
              src={visible[active].url}
              localSrc={visible[active].local}
              alt={visible[active].alt}
              sexual={visible[active].sexual}
              className="max-h-[88vh] max-w-[92vw] rounded-lg"
              fit="contain"
            />
            <div className="absolute -bottom-7 left-0 right-0 text-center text-xs text-muted">
              {active + 1} / {visible.length}
              {visible[active].dims && visible[active].dims![0] > 0 && (
                <span className="ml-2 font-mono opacity-80">
                  {visible[active].dims![0]}×{visible[active].dims![1]}
                </span>
              )}
              {visible[active].caption && ` · ${visible[active].caption}`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Single thumbnail in the media grid. The image itself is now the
 * primary click target — clicking opens the lightbox; the
 * "Set as cover" / "Set as banner" / "Open original" affordances are
 * collapsed into a kebab menu anchored to the top-right corner.
 *
 * Manual QA flagged that the previous layout painted two large
 * gradient buttons across most of the thumbnail, hiding the actual
 * screenshot from view. The kebab approach matches the standard
 * gallery convention: image stays visible, secondary actions hide
 * behind a single discoverable affordance.
 *
 * Visibility rules:
 *   - Desktop (`md+`): kebab is hidden by default, fades in on tile
 *     hover or focus-within (so keyboard users see it the moment
 *     the tile receives focus).
 *   - Touch / small viewports (`< md`): kebab is always visible so
 *     touch users always have a target.
 *   - Tap target is 32×32 minimum (h-8 w-8 = 2rem) to clear the
 *     WCAG 2.5.5 + Material touch-size recommendation.
 */
function MediaTile({
  item,
  vnId,
  onOpenLightbox,
}: {
  item: MediaItem;
  vnId: string;
  onOpenLightbox: () => void;
}) {
  const t = useT();
  // Prefer the local path so the banner survives offline / cache misses.
  const bannerValue = item.local || item.url;
  // Per-image rotation preview state. This is intentionally NOT persisted
  // — the rotation is meant as a preview for the operator to evaluate a
  // candidate cover/banner orientation before committing. Once the
  // image is promoted via "Set as cover" / "Set as banner", the
  // persisted rotation flag is re-evaluated through the dedicated
  // CoverHero / HeroBanner controls that PATCH the rotation field.
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const rotateBy = (delta: 90 | -90) => {
    setRotation((r) => ((((r + delta) % 360) + 360) % 360) as 0 | 90 | 180 | 270);
  };

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border border-border bg-bg-elev ${
        item.aspect === 'landscape'
          ? 'aspect-video'
          : item.aspect === 'square'
            ? 'aspect-square'
            : 'aspect-[2/3]'
      }`}
    >
      <button
        type="button"
        onClick={onOpenLightbox}
        className="h-full w-full"
        title={item.caption ?? item.alt}
        aria-label={t.media.openLightbox}
      >
        <SafeImage
          src={item.thumbnail || item.url}
          localSrc={item.local_thumb || item.local}
          alt={item.alt}
          sexual={item.sexual}
          rotation={rotation}
          className="h-full w-full"
          fit={item.aspect === 'landscape' ? 'cover' : 'contain'}
        />
      </button>
      <TileKebab
        vnId={vnId}
        item={item}
        bannerValue={bannerValue}
        onOpenLightbox={onOpenLightbox}
        rotation={rotation}
        onRotateLeft={() => rotateBy(-90)}
        onRotateRight={() => rotateBy(90)}
        onResetRotation={() => setRotation(0)}
      />
      {item.dims && item.dims[0] > 0 && item.dims[1] > 0 && (
        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-mono text-white backdrop-blur-sm">
          {item.dims[0]}×{item.dims[1]}
        </span>
      )}
      {item.caption && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-[10px] text-white transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          {item.caption}
        </span>
      )}
    </div>
  );
}

/**
 * Per-tile kebab dropdown. Renders inside the same positioned tile
 * wrapper so the popover anchors against `top-1.5 right-1.5`. The
 * dropdown uses collision-aware placement similar to
 * EditionInfoPopover: it flips above when there isn't enough room
 * below, and flips left when the tile sits at the right edge of the
 * viewport.
 *
 * Sizing contract (locked by `tests/media-menu.test.ts`):
 *   - `min-width: 12rem`, `max-width: 18rem` so the menu never spans
 *     the entire tile on a wide-localised label, never narrower than
 *     `MEDIA_MENU_MIN_WIDTH_REM`.
 *   - Per-row labels use `whitespace-nowrap overflow-hidden
 *     text-overflow: ellipsis`; the short label is rendered visibly
 *     while the long form rides as the row's `aria-label` and
 *     `title`.
 *   - Horizontal flip triggers when the kebab sits within
 *     `MEDIA_MENU_FLIP_REM` of the right viewport edge.
 *
 * Keyboard contract:
 *   - ArrowDown / ArrowUp: roving focus across menu items, wraps at
 *     both ends.
 *   - Enter / Space: activate the focused item (default <button>/<a>
 *     handlers fire).
 *   - Escape: close, restore focus to the kebab trigger.
 *
 * Items:
 *   - Open lightbox      (mirrors the image click for keyboard users
 *                         who would otherwise have to leave the menu)
 *   - Set as cover       (POST /api/collection/[id]/cover)
 *   - Set as banner      (POST /api/collection/[id]/banner)
 *   - Open original      (`<a target="_blank">` to the source URL)
 */
function TileKebab({
  vnId,
  item,
  bannerValue,
  onOpenLightbox,
  rotation,
  onRotateLeft,
  onRotateRight,
  onResetRotation,
}: {
  vnId: string;
  item: MediaItem;
  bannerValue: string;
  onOpenLightbox: () => void;
  rotation: 0 | 90 | 180 | 270;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onResetRotation: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<{
    vertical: 'below' | 'above';
    horizontal: 'left' | 'right';
  }>({ vertical: 'below', horizontal: 'left' });
  const [placed, setPlaced] = useState(false);
  // Per-action busy flag so the user can see which item is mid-flight.
  const [busy, setBusy] = useState<'cover' | 'banner' | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Outside-click + Escape + arrow-key roving focus.
  useEffect(() => {
    if (!open) return;
    if (typeof document === 'undefined') return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') {
        return;
      }
      // Arrow keys move the roving focus through `role="menuitem"`
      // / `role="menuitemcheckbox"` rows inside the menu. Without
      // this the kebab was tab-only, which on a long menu meant
      // four discrete Tab keystrokes to reach the last entry.
      const menu = menuRef.current;
      if (!menu) return;
      const items = Array.from(
        menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]'),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (items.length === 0) return;
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      let nextIndex = currentIndex;
      if (e.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
      else if (e.key === 'ArrowUp')
        nextIndex = (currentIndex - 1 + items.length) % items.length;
      else if (e.key === 'Home') nextIndex = 0;
      else if (e.key === 'End') nextIndex = items.length - 1;
      e.preventDefault();
      items[nextIndex]?.focus({ preventScroll: true });
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Land focus on the first menu item when the menu opens so a
  // keyboard user can arrow / Enter without an extra Tab.
  useEffect(() => {
    if (!open || !placed) return;
    if (typeof document === 'undefined') return;
    const first = menuRef.current?.querySelector<HTMLElement>(
      '[role="menuitem"], [role="menuitemcheckbox"]',
    );
    first?.focus({ preventScroll: true });
  }, [open, placed]);

  // Collision detection — mirrors EditionInfoPopover. Measure the
  // tile (the trigger's offsetParent) instead of the small kebab
  // button so the popover never spills below the tile boundary.
  useEffect(() => {
    if (!open) {
      setPlaced(false);
      return;
    }
    if (typeof window === 'undefined') return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const anchor = (trigger.offsetParent as HTMLElement | null) ?? trigger;
    const compute = () => {
      const rect = anchor.getBoundingClientRect();
      const popH = menu.offsetHeight;
      const viewportH = window.innerHeight;
      const viewportW = window.innerWidth;
      const spaceBelow = viewportH - rect.bottom;
      const spaceAbove = rect.top;
      const vertical: 'below' | 'above' =
        spaceBelow < popH + 12 && spaceAbove > spaceBelow ? 'above' : 'below';
      // Kebab sits in the top-right corner — default to opening
      // left so the menu doesn't spill off the right edge. Use a
      // 12rem viewport-edge threshold (matching the menu's
      // min-width) rather than the live menu width so the flip
      // behaviour stays predictable across density / zoom levels.
      const horizontal = decideMediaMenuHorizontal(rect.right, viewportW);
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

  async function setAs(kind: 'cover' | 'banner') {
    if (busy) return;
    setBusy(kind);
    // Best-guess resolved src + local pair for the optimistic event.
    // `bannerValue` is the path we send to the server; for paths
    // beginning with `vn-sc/` / `vn/` / `cover/` etc. it's the local
    // storage path, so we expose it as `newLocal`. Remote URLs
    // (http(s)://…) become `newSrc`.
    const isRemote = /^https?:\/\//i.test(bannerValue);
    const newSrc = isRemote ? bannerValue : item.url;
    const newLocal = isRemote ? null : bannerValue;
    try {
      const path = kind === 'cover' ? 'cover' : 'banner';
      const res = await fetch(`/api/collection/${vnId}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'path', value: bannerValue }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || t.common.error);
      }
      // Notify every mounted surface (HeroBanner, CoverEditOverlay,
      // VnCard, OwnedEditionsSection, sibling MediaTile renderers) so
      // the new cover/banner paints without a manual refresh. The
      // router.refresh() below is a defensive fallback for server-
      // rendered surfaces (cards on the Library page) that don't
      // listen to the event.
      if (kind === 'cover') {
        dispatchCoverChanged({ vnId, newSrc, newLocal });
      } else {
        dispatchBannerChanged({ vnId, newSrc, newLocal });
      }
      toast.success(t.toast.saved);
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        // Stop propagation so the underlying image-button doesn't
        // also fire (which would open the lightbox below the menu).
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t.media.actionsMenu}
        title={t.media.actionsMenu}
        // 32×32 minimum on touch. `opacity-100` on small viewports
        // keeps the affordance always visible for touch users;
        // hover/focus reveals it on desktop only. focus-visible
        // forces the kebab to appear the moment a keyboard user
        // tabs into the tile so they never lose the entry point.
        className="absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-md bg-black/70 text-white shadow backdrop-blur-sm transition-opacity hover:bg-accent hover:text-bg focus-visible:opacity-100 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {/*
        Portal-mounted dropdown — escapes the tile's
        `overflow-hidden` clipping so the menu never gets sliced
        by the image bounds. The old in-tile absolute-positioned
        version was cropped by the `aspect-[2/3]` /
        `aspect-video` parent, which is exactly the regression
        the operator flagged ("partial labels inside the image").
      */}
      <PortalPopover
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        label={t.media.actionsMenu}
        panelClassName="rounded-md border border-border bg-bg-card p-1 text-xs shadow-card"
      >
        <div
          ref={menuRef}
          role="menu"
          aria-label={t.media.actionsMenu}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            minWidth: `${MEDIA_MENU_MIN_WIDTH_REM}rem`,
            maxWidth: `${MEDIA_MENU_MAX_WIDTH_REM}rem`,
          }}
        >
          <MenuItem
            icon={<Maximize2 className="h-3.5 w-3.5" aria-hidden />}
            shortLabel={t.media.openLightboxShort}
            longLabel={t.media.openLightbox}
            onClick={() => {
              setOpen(false);
              onOpenLightbox();
            }}
          />
          {/*
            Rotation preview entries. Per-image only; the rotation is
            kept in the tile's local state so the operator can audition
            an orientation before committing it via "Set as cover" /
            "Set as banner". The persisted rotation field is owned by
            CoverHero / HeroBanner, not the gallery preview.
          */}
          <MenuItem
            icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
            shortLabel={t.coverActions.rotateLeft}
            longLabel={t.coverActions.rotateLeft}
            onClick={() => {
              onRotateLeft();
            }}
          />
          <MenuItem
            icon={<RotateCw className="h-3.5 w-3.5" aria-hidden />}
            shortLabel={t.coverActions.rotateRight}
            longLabel={t.coverActions.rotateRight}
            onClick={() => {
              onRotateRight();
            }}
          />
          {rotation !== 0 && (
            <MenuItem
              icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
              shortLabel={t.coverActions.resetRotation}
              longLabel={t.coverActions.resetRotation}
              onClick={() => {
                onResetRotation();
              }}
            />
          )}
          {rotation !== 0 && (
            <p className="max-w-[17rem] px-2 py-1 text-[10px] leading-snug text-muted">
              {t.media.rotationPreviewOnly}
            </p>
          )}
          <MenuItem
            icon={<ImageDown className="h-3.5 w-3.5" aria-hidden />}
            shortLabel={t.media.setAsCoverShort}
            longLabel={t.media.setAsCover}
            onClick={() => setAs('cover')}
            disabled={busy === 'cover'}
          />
          <MenuItem
            icon={<ImageUp className="h-3.5 w-3.5" aria-hidden />}
            shortLabel={t.media.setAsBannerShort}
            longLabel={t.media.setAsBanner}
            onClick={() => setAs('banner')}
            disabled={busy === 'banner'}
          />
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            aria-label={t.media.openOriginal}
            title={t.media.openOriginal}
            className="flex w-full items-center gap-2 overflow-hidden rounded px-2 py-1.5 text-left text-muted hover:bg-bg-elev hover:text-white focus:bg-bg-elev focus:text-white focus:outline-none"
          >
            <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate whitespace-nowrap">{t.media.openOriginalShort}</span>
          </a>
        </div>
      </PortalPopover>
    </>
  );
}

/**
 * Single menu row inside the kebab dropdown.
 *
 * Renders `shortLabel` visibly (truncated with ellipsis when it
 * still doesn't fit at the 18rem cap) and routes `longLabel` to
 * `aria-label` + `title` so the full text remains discoverable on
 * hover / by assistive tech. The button itself is `tabIndex={-1}`
 * — focus arrives through the roving keyboard handler so a single
 * Tab into the menu doesn't slide back out the bottom.
 */
function MenuItem({
  icon,
  shortLabel,
  longLabel,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  shortLabel: string;
  longLabel: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={onClick}
      disabled={disabled}
      aria-label={longLabel}
      title={longLabel}
      className="flex w-full items-center gap-2 overflow-hidden rounded px-2 py-1.5 text-left text-muted hover:bg-bg-elev hover:text-white focus:bg-bg-elev focus:text-white focus:outline-none disabled:opacity-50"
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate whitespace-nowrap">{shortLabel}</span>
    </button>
  );
}
