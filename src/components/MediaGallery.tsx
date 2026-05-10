'use client';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { SafeImage } from './SafeImage';
import { SetBannerButton } from './SetBannerButton';
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
        alt: `Screenshot ${i + 1}`,
        aspect: 'landscape',
      })),
    };
    for (const img of releaseImages) {
      const item: MediaItem = {
        key: `${img.release_id}-${img.id ?? img.url}`,
        url: img.url,
        thumbnail: img.thumbnail ?? null,
        local: img.local ?? null,
        local_thumb: img.local_thumb ?? null,
        sexual: img.sexual ?? null,
        alt: `${img.type} — ${img.release_title}`,
        caption: img.release_title,
        aspect: img.type === 'pkgmed' ? 'square' : 'portrait',
      };
      out[img.type].push(item);
    }
    return out;
  }, [screenshots, releaseImages]);

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
              <div className="pointer-events-none absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <span className="pointer-events-auto">
                  <SetBannerButton vnId={vnId} value={bannerValue} />
                </span>
              </div>
              {item.caption && (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {item.caption}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {active != null && visible[active] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={close}>
          <button
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-bg-card text-white"
            onClick={(e) => { e.stopPropagation(); close(); }}
            aria-label={t.common.close}
          >
            <X className="h-5 w-5" />
          </button>
          {visible.length > 1 && (
            <>
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-bg-card text-white"
                onClick={(e) => { e.stopPropagation(); prev(); }}
                aria-label="Prev"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-bg-card text-white"
                onClick={(e) => { e.stopPropagation(); next(); }}
                aria-label="Next"
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
              {visible[active].caption && ` · ${visible[active].caption}`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
