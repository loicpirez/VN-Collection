'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { SafeImage } from './SafeImage';
import { VnSourcePicker, type VnPickerHit, type VnPickerSource } from './VnSourcePicker';
import { GAME_ARTWORK_KINDS, decodeGameArtwork, type GameArtwork, type GameArtworkImage } from '@/lib/game-artwork';
import { useT } from '@/lib/i18n/client';

const SOURCES: VnPickerSource[] = ['library', 'vndb'];
const PAGE_SIZE = 18;

type ImageFilter = 'all' | GameArtworkImage['kind'];

interface Props {
  targetId: string;
  target: 'cover' | 'banner';
  busy: boolean;
  onApply: (value: string) => void;
}

export function GameArtworkPicker({ targetId, target, busy, onApply }: Props) {
  const t = useT();
  const [game, setGame] = useState<VnPickerHit | null>(null);
  const [artwork, setArtwork] = useState<GameArtwork | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<ImageFilter>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<GameArtworkImage | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const gameId = game?.id;

  useEffect(() => {
    if (!gameId) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/vn/${gameId}/artwork`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error();
        const result = decodeGameArtwork(await response.json());
        if (!result) throw new Error();
        if (!controller.signal.aborted) setArtwork(result);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [gameId, attempt]);

  useEffect(() => {
    if (gameId) headingRef.current?.focus();
  }, [gameId, selected]);

  function chooseGame(hit: VnPickerHit) {
    setArtwork(null);
    setFailed(false);
    setFilter('all');
    setLimit(PAGE_SIZE);
    setGame(hit);
  }

  function backToSearch() {
    setGame(null);
    setSelected(null);
    requestAnimationFrame(() => searchRef.current?.querySelector('input')?.focus());
  }

  function retry() {
    setArtwork(null);
    setFailed(false);
    setAttempt((previous) => previous + 1);
  }

  function imageLabel(image: GameArtworkImage) {
    return image.releaseType && image.label
      ? `${t.media[image.releaseType]} / ${image.label}`
      : t.gameArtwork[image.kind];
  }

  const images = artwork?.images ?? [];
  const filtered = filter === 'all' ? images : images.filter((image) => image.kind === filter);
  const loading = !artwork && !failed;

  return (
    <div className="space-y-3">
      <div hidden={!!game} ref={searchRef}>
        <VnSourcePicker
          sources={SOURCES}
          perSourceLimit={12}
          excludeId={targetId}
          searchLabel={t.gameArtwork.search}
          placeholder={t.gameArtwork.placeholder}
          onPick={chooseGame}
        />
      </div>
      {game && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h3 ref={headingRef} tabIndex={-1} className="min-w-0 break-words font-semibold outline-none">{game.title}</h3>
            <button
              type="button"
              className="btn min-h-[44px]"
              onClick={selected ? () => setSelected(null) : backToSearch}
              disabled={busy}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {selected ? t.gameArtwork.backToImages : t.gameArtwork.backToSearch}
            </button>
          </div>
          {selected ? (
            <div className="space-y-3">
              <div className={`mx-auto overflow-hidden rounded-lg border border-border bg-bg-elev ${target === 'cover' ? 'aspect-[2/3] w-full max-w-[11rem]' : 'aspect-[3/1] w-full'}`}>
                <SafeImage src={selected.remote} localSrc={selected.local} sexual={selected.sexual} alt={imageLabel(selected)} priority className="h-full w-full" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 break-words text-sm text-muted">{imageLabel(selected)}</p>
                <button type="button" disabled={busy} className="btn btn-primary min-h-[44px]" onClick={() => onApply(selected.value)}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                  {target === 'cover' ? t.media.setAsCover : t.media.setAsBanner}
                </button>
              </div>
            </div>
          ) : (
            <div aria-busy={loading} className="space-y-3">
              {(failed || artwork?.releaseUnavailable) && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-bg-elev p-2 text-sm">
                  <p>{failed ? t.gameArtwork.loadError : t.gameArtwork.releaseError}</p>
                  <button type="button" onClick={retry} className="btn min-h-[44px]">{t.common.retry}</button>
                </div>
              )}
              {loading && (
                <div aria-hidden className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[0, 1, 2, 3, 4, 5].map((item) => (
                    <div key={item} className="skeleton-surface aspect-[4/3] animate-pulse rounded-md" />
                  ))}
                </div>
              )}
              {artwork && !images.length && !artwork.releaseUnavailable && (
                <p role="status" className="py-3 text-sm text-muted">{t.gameArtwork.empty}</p>
              )}
              {images.length > 0 && (
                <>
                  <div role="group" aria-label={t.gameArtwork.filter} className="flex flex-wrap gap-1.5">
                    {(['all', ...GAME_ARTWORK_KINDS] as const).map((kind) => {
                      const count = kind === 'all' ? images.length : images.filter((image) => image.kind === kind).length;
                      if (!count) return null;
                      return (
                        <button
                          key={kind}
                          type="button"
                          className={`btn min-h-[44px] ${kind === filter ? 'border-accent text-accent' : ''}`}
                          aria-pressed={kind === filter}
                          onClick={() => { setFilter(kind); setLimit(PAGE_SIZE); }}
                        >
                          {t.gameArtwork[kind]} <span className="tabular-nums text-muted">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {filtered.slice(0, limit).map((image) => (
                      <li key={image.value} className="relative min-w-0 rounded-md border border-border bg-bg-elev hover:border-accent">
                        <SafeImage
                          src={image.thumbnail || image.remote}
                          localSrc={image.localThumbnail || image.local}
                          sexual={image.sexual}
                          alt=""
                          className="aspect-[4/3] w-full rounded-t-md bg-bg"
                          fit="contain"
                        />
                        <button
                          type="button"
                          className="min-h-[44px] w-full break-words px-2 py-1 text-left text-xs after:absolute after:inset-0 after:rounded-md focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-accent"
                          onClick={() => setSelected(image)}
                        >
                          {imageLabel(image)}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {filtered.length > limit && (
                    <button type="button" className="btn min-h-[44px]" onClick={() => setLimit(limit + PAGE_SIZE)}>
                      {t.gameArtwork.more}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
