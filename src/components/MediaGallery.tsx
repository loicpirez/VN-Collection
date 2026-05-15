'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useDialogA11y } from './Dialog';
import { SafeImage } from './SafeImage';
import { SetBannerButton } from './SetBannerButton';
import { SetCoverButton } from './SetCoverButton';
import { useT } from '@/lib/i18n/client';
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
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TYPE_KEYS.filter((k) => counts[k] > 0).map((k) => (
          <button
            key={k}
            type="button"
            className={`chip ${filter === k ? 'chip-active' : ''}`}
            onClick={() => setFilter(k)}
          >
            {t.media[k]} <span className="ml-1 opacity-70">{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        {visible.map((item, i) => {
          // Prefer the local path so the banner survives offline / cache misses.
          const bannerValue = item.local || item.url;
          return (
            <div
              key={item.key}
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
                onClick={() => setActive(i)}
                className="h-full w-full"
                title={item.caption ?? item.alt}
              >
                <SafeImage
                  src={item.thumbnail || item.url}
                  localSrc={item.local_thumb || item.local}
                  alt={item.alt}
                  sexual={item.sexual}
                  className="h-full w-full"
                  fit={item.aspect === 'landscape' ? 'cover' : 'contain'}
                />
              </button>
              <div className="pointer-events-none absolute right-1.5 top-1.5 flex flex-col items-end gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                <span className="pointer-events-auto">
                  <SetBannerButton vnId={vnId} value={bannerValue} />
                </span>
                <span className="pointer-events-auto">
                  <SetCoverButton vnId={vnId} value={bannerValue} />
                </span>
              </div>
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
        })}
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
