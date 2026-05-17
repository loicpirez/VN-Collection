'use client';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useDialogA11y } from './Dialog';
import { useRouter } from 'next/navigation';
import { Check, ImagePlus, Link as LinkIcon, Loader2, RotateCcw, RotateCw, Sparkles, X } from 'lucide-react';
import { SafeImage } from './SafeImage';
import { SkeletonBlock } from './Skeleton';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { dispatchCoverChanged } from '@/lib/cover-banner-events';
import type { ReleaseImage, Screenshot } from '@/lib/types';

interface Props {
  vnId: string;
  /** VNDB's default image URL — clicking "use VNDB" clears any override. */
  vndbImage: string | null;
  /** EGS numeric id — when set, the EGS tab is enabled and points to /api/egs-cover/<id>. */
  egsId: number | null;
  /** Current custom cover string (path / URL) — drives the "current" visual marker. */
  currentCustomCover: string | null;
  /**
   * Current cover rotation in degrees (0/90/180/270). The picker
   * surfaces dedicated rotate-left / rotate-right / reset buttons
   * inside the modal so the user doesn't have to dismiss the
   * picker to find the inline buttons on `<CoverHero>`. Stays
   * orthogonal to the source-tab selection — rotating doesn't
   * change which cover (VNDB / EGS / custom) is active.
   */
  currentRotation?: 0 | 90 | 180 | 270;
  screenshots: Screenshot[];
  releaseImages: ReleaseImage[];
}

type Tab = 'vndb' | 'egs' | 'custom';

/**
 * Centralized cover-source picker that lets the user pick the cover for
 * a VN from one of three categorical sources:
 *
 *   1. VNDB — revert to the default image VNDB serves for this VN.
 *   2. EGS  — use ErogameScape's cover, resolved via /api/egs-cover/[id].
 *   3. Custom — file upload, paste a URL, or pick from images already
 *       attached to this VN (screenshots + per-release art).
 *
 * Opens as a modal so the picker doesn't fight for room with the rest
 * of the detail page. Selection writes through /api/collection/[id]/cover
 * and `router.refresh()` propagates the change to every server-rendered
 * surface that reads custom_cover.
 */
export function CoverSourcePicker({
  vnId,
  vndbImage,
  egsId,
  currentCustomCover,
  currentRotation = 0,
  screenshots,
  releaseImages,
}: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(initialTab(egsId, currentCustomCover));
  const [busy, setBusy] = useState(false);
  const [rotation, setRotationState] = useState<0 | 90 | 180 | 270>(currentRotation);
  // Re-sync with the server-rendered value whenever the parent
  // re-renders us with a different baseline (e.g. another rotate
  // surface fired first). Keeps the modal's local optimistic state
  // honest against the canonical row.
  useEffect(() => {
    setRotationState(currentRotation);
  }, [currentRotation]);
  const [, startTransition] = useTransition();
  const [urlValue, setUrlValue] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const customTabId = useId();
  const vndbTabId = useId();
  const egsTabId = useId();
  const customPanelId = useId();
  const vndbPanelId = useId();
  const egsPanelId = useId();

  // body-scroll lock + ESC + focus trap. Replaces the previous
  // bespoke ESC handler with the shared hook so every modal in the
  // app gets the same a11y guarantees.
  useDialogA11y({ open, onClose: () => setOpen(false), panelRef: dialogRef });

  // Listen for a global "open the cover picker" event so secondary
  // triggers (e.g. the hover overlay on the cover image itself) can
  // pop this modal without re-implementing the upload flow. Scoped to
  // this vnId so visiting another VN's detail page in the same session
  // doesn't accidentally cross-open another VN's picker.
  useEffect(() => {
    function onOpen(e: Event) {
      const ce = e as CustomEvent<{ vnId?: string }>;
      if (ce.detail?.vnId && ce.detail.vnId !== vnId) return;
      setOpen(true);
      setTab('custom');
    }
    window.addEventListener('vn:open-cover-picker', onOpen as EventListener);
    return () => window.removeEventListener('vn:open-cover-picker', onOpen as EventListener);
  }, [vnId]);

  /**
   * Storing a new custom_cover only changes the displayed hero when the
   * user's `source_pref.image` resolves to the custom column. If the user
   * had previously pinned VNDB or EGS, custom would lose. So every
   * "pick a custom" path here ALSO flips `source_pref.image` to 'custom'
   * — picking a new cover should obviously promote it to active. This
   * was the "selecting new cover doesn't do anything" bug.
   */
  async function pinCustomPref(): Promise<void> {
    try {
      await fetch(`/api/collection/${vnId}/source-pref`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: 'custom' }),
      });
    } catch {
      // Pref sync is best-effort; cover already saved.
    }
  }

  async function applySource(source: 'url' | 'screenshot' | 'release' | 'path', value: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/collection/${vnId}/cover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, value }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      await pinCustomPref();
      // Optimistic broadcast so the rendered hero / cards repaint
      // before router.refresh() comes back. `value` may be either a
      // remote URL or a relative storage path; split on the scheme
      // prefix so listeners can pick the right /api/files/ vs URL
      // rendering path.
      const isRemote = /^https?:\/\//i.test(value);
      dispatchCoverChanged({
        vnId,
        newSrc: isRemote ? value : null,
        newLocal: isRemote ? null : value,
      });
      toast.success(t.toast.coverSaved);
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resetToVndb() {
    setBusy(true);
    try {
      // Clear any custom_cover override then pin the source pref to VNDB
      // so the hero resolver picks vndbPoster regardless of what custom
      // / EGS columns contain.
      const r = await fetch(`/api/collection/${vnId}/cover`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      await fetch(`/api/collection/${vnId}/source-pref`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: 'vndb' }),
      }).catch(() => undefined);
      // Tell every mounted listener the custom cover is gone so the
      // hero falls back to the VNDB image immediately rather than
      // after the next router refresh resolves.
      dispatchCoverChanged({ vnId, newSrc: vndbImage, newLocal: null });
      toast.success(t.toast.coverReset);
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Use the EGS cover by flipping `source_pref.image = 'egs'` rather than
   * stuffing the EGS proxy URL into `custom_cover`. The hero resolver
   * already handles egsPoster as a first-class column.
   */
  async function useEgs() {
    setBusy(true);
    try {
      const r = await fetch(`/api/collection/${vnId}/source-pref`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: 'egs' }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      // Don't know the resolved EGS URL here (the EGS resolver is
      // server-side) so just nudge listeners; the router.refresh
      // pickup will deliver the right src on the next render.
      dispatchCoverChanged({ vnId, newSrc: null, newLocal: null });
      toast.success(t.toast.coverSaved);
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function rotateBy(delta: 90 | -90 | 'reset') {
    if (busy) return;
    const prev = rotation;
    const next: 0 | 90 | 180 | 270 =
      delta === 'reset'
        ? 0
        : (((((rotation + delta) % 360) + 360) % 360) as 0 | 90 | 180 | 270);
    if (next === prev) return;
    setRotationState(next);
    setBusy(true);
    try {
      const r = await fetch(`/api/collection/${vnId}/cover`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotation: next }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      // Same broadcast pattern as <CoverHero>: the listeners
      // already handle a rotation-only update without touching
      // src/local, so omit those and let the consumer keep
      // whatever cover bytes it already had.
      dispatchCoverChanged({ vnId, newSrc: null, newLocal: null, rotation: next });
      toast.success(t.toast.coverSaved);
      startTransition(() => router.refresh());
    } catch (e) {
      setRotationState(prev);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error(t.cover.mustBeImage);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`/api/collection/${vnId}/cover`, { method: 'POST', body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const payload = (await r.json().catch(() => ({}))) as { cover?: string | null };
      await pinCustomPref();
      // The cover route returns the new storage path; surface it so
      // listeners can repaint immediately. The path is local — the
      // remote URL is `null` since this came from an upload.
      dispatchCoverChanged({ vnId, newSrc: null, newLocal: payload.cover ?? null });
      toast.success(t.toast.coverSaved);
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const galleryItems = [
    ...screenshots.map((s, i) => ({
      key: `sc-${i}`,
      src: s.thumbnail || s.url,
      local: s.local_thumb || s.local || null,
      value: s.local || s.url,
      source: 'screenshot' as const,
      sexual: s.sexual ?? null,
      label: `${t.media.screenshots} ${i + 1}`,
    })),
    ...releaseImages.map((img) => ({
      key: `${img.release_id}-${img.id ?? img.url}`,
      src: img.thumbnail || img.url,
      local: img.local_thumb || img.local || null,
      value: img.local || img.url,
      source: 'release' as const,
      sexual: img.sexual ?? null,
      label: `${mediaTypeLabel(img.type, t)} · ${img.release_title}`,
    })),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn"
        title={t.coverPicker.openTitle}
      >
        <ImagePlus className="h-4 w-4" />
        {t.coverPicker.open}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-bg-card shadow-card outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 id={titleId} className="text-base font-bold">{t.coverPicker.title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted hover:bg-bg-elev hover:text-white"
                aria-label={t.common.close}
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            {/*
              Rotation row — orthogonal to the source tabs. Surfaces
              the same rotate-left / rotate-right / reset triplet
              that lives on `<CoverHero>` so the user can adjust
              without dismissing the modal. Reads the current
              rotation through the `currentRotation` prop and writes
              via PATCH `/api/collection/[id]/cover { rotation }`.
            */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-bg-elev/30 px-4 py-2 text-xs">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted">
                {t.coverActions.rotationLabel} · {rotation}°
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => rotateBy(-90)}
                  disabled={busy}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                  title={t.coverActions.rotateLeft}
                  aria-label={t.coverActions.rotateLeft}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  <span className="hidden sm:inline">{t.coverActions.rotateLeft}</span>
                </button>
                <button
                  type="button"
                  onClick={() => rotateBy(90)}
                  disabled={busy}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                  title={t.coverActions.rotateRight}
                  aria-label={t.coverActions.rotateRight}
                >
                  <RotateCw className="h-3.5 w-3.5" aria-hidden />
                  <span className="hidden sm:inline">{t.coverActions.rotateRight}</span>
                </button>
                <button
                  type="button"
                  onClick={() => rotateBy('reset')}
                  disabled={busy || rotation === 0}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-40"
                  title={t.coverActions.resetRotation}
                >
                  {t.coverActions.resetRotation}
                </button>
              </div>
            </div>
            <nav role="tablist" aria-label={t.coverPicker.title} className="flex border-b border-border">
              <TabButton
                active={tab === 'custom'}
                onClick={() => setTab('custom')}
                id={customTabId}
                controls={customPanelId}
              >
                {t.coverPicker.custom}
              </TabButton>
              <TabButton
                active={tab === 'vndb'}
                onClick={() => setTab('vndb')}
                id={vndbTabId}
                controls={vndbPanelId}
              >
                VNDB
              </TabButton>
              <TabButton
                active={tab === 'egs'}
                onClick={() => setTab('egs')}
                disabled={!egsId}
                id={egsTabId}
                controls={egsPanelId}
              >
                EGS
              </TabButton>
            </nav>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {tab === 'vndb' && (
                <section role="tabpanel" id={vndbPanelId} aria-labelledby={vndbTabId} tabIndex={0} className="text-sm">
                  <p className="mb-3 text-xs text-muted">{t.coverPicker.vndbHint}</p>
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="h-48 w-32 shrink-0 overflow-hidden rounded-lg border border-border bg-bg-elev">
                      <SafeImage src={vndbImage} alt="VNDB" className="h-full w-full" />
                    </div>
                    <div className="flex-1">
                      <button
                        type="button"
                        onClick={resetToVndb}
                        disabled={busy || !currentCustomCover}
                        className="btn btn-primary"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        {t.coverPicker.useVndb}
                      </button>
                      {!currentCustomCover && (
                        <p className="mt-2 text-[11px] text-muted">{t.coverPicker.alreadyUsing}</p>
                      )}
                    </div>
                  </div>
                </section>
              )}
              {tab === 'egs' && (
                <section role="tabpanel" id={egsPanelId} aria-labelledby={egsTabId} tabIndex={0} className="text-sm">
                  <p className="mb-3 text-xs text-muted">{t.coverPicker.egsHint}</p>
                  {egsId ? (
                    <EgsCandidateGrid
                      egsId={egsId}
                      busy={busy}
                      onUseDefault={useEgs}
                      onPickUrl={(url) => applySource('url', url)}
                    />
                  ) : (
                    <p className="text-xs text-muted">{t.coverPicker.noEgs}</p>
                  )}
                </section>
              )}
              {tab === 'custom' && (
                <section role="tabpanel" id={customPanelId} aria-labelledby={customTabId} tabIndex={0} className="space-y-4 text-sm">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted">
                      {t.coverPicker.uploadLabel}
                    </label>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadFile(f);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={busy}
                      className="btn"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                      {t.coverPicker.chooseFile}
                    </button>
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted">
                      {t.coverPicker.urlLabel}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="url"
                        inputMode="url"
                        value={urlValue}
                        onChange={(e) => setUrlValue(e.target.value)}
                        placeholder="https://…"
                        aria-label={t.coverPicker.urlLabel}
                        className="input flex-1 min-w-[200px]"
                      />
                      <button
                        type="button"
                        onClick={() => urlValue.trim() && applySource('url', urlValue.trim())}
                        disabled={busy || urlValue.trim().length === 0}
                        className="btn"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                        {t.coverPicker.applyUrl}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted">
                      {t.coverPicker.galleryLabel} · {galleryItems.length}
                    </label>
                    {galleryItems.length === 0 ? (
                      <p className="text-xs text-muted">{t.coverPicker.galleryEmpty}</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                        {galleryItems.map((it) => {
                          const isCurrent = currentCustomCover === it.value;
                          return (
                            <button
                              key={it.key}
                              type="button"
                              onClick={() => applySource(it.source, it.value)}
                              disabled={busy}
                              className={`group relative aspect-[2/3] overflow-hidden rounded-md border bg-bg-elev transition-colors ${
                                isCurrent ? 'border-accent ring-2 ring-accent' : 'border-border hover:border-accent'
                              }`}
                              title={it.label}
                            >
                              <SafeImage
                                src={it.src}
                                localSrc={it.local}
                                alt={it.label}
                                sexual={it.sexual}
                                className="h-full w-full"
                                fit="cover"
                              />
                              {isCurrent && (
                                <span className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-bg">
                                  <Check className="h-3 w-3" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TabButton({
  active,
  onClick,
  disabled,
  id,
  controls,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  id?: string;
  controls?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      className={`relative flex-1 px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
        disabled
          ? 'cursor-not-allowed text-muted/40'
          : active
            ? 'text-white'
            : 'text-muted hover:text-white'
      }`}
    >
      {children}
      {active && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-accent" />}
    </button>
  );
}

type MediaTypeKey = 'pkgfront' | 'pkgback' | 'pkgcontent' | 'pkgside' | 'pkgmed' | 'dig';

function mediaTypeLabel(rawType: string, t: ReturnType<typeof useT>): string {
  const key = rawType.toLowerCase() as MediaTypeKey;
  const labels: Record<MediaTypeKey, string> = {
    pkgfront: t.media.pkgfront,
    pkgback: t.media.pkgback,
    pkgcontent: t.media.pkgcontent,
    pkgside: t.media.pkgside,
    pkgmed: t.media.pkgmed,
    dig: t.media.dig,
  };
  return labels[key] ?? rawType;
}

function initialTab(_egsId: number | null, _currentCustom: string | null): Tab {
  // Default to the Custom tab — the modal exists primarily so users can
  // upload their own image, paste a URL, or pick from the in-VN gallery.
  // Reverting to VNDB or switching to EGS is a one-click affordance from
  // any tab. Earlier versions opened on whichever source was currently
  // active, but that hid the upload button behind a tab switch and
  // confused users who came in looking for "upload custom cover".
  return 'custom';
}

interface EgsCandidate {
  source: 'banner' | 'vndb' | 'image_php' | 'surugaya' | 'dmm' | 'dlsite' | 'gyutto';
  url: string;
  label: string;
}

/**
 * Side-by-side grid of EVERY cover source EGS knows about — banner,
 * linked VNDB cover, EGS image.php, plus shop URLs (Suruga-ya / DMM /
 * DLsite / Gyutto). Each tile is clickable; the user picks the one
 * they like and we pin it as a custom URL so it survives subsequent
 * EGS refreshes (which otherwise re-run the priority fallback).
 *
 * The default-resolver path (which auto-picks per priority order)
 * is preserved as a separate "Use EGS auto" button at the bottom —
 * for users who don't want to pick manually.
 */
function EgsCandidateGrid({
  egsId,
  busy,
  onUseDefault,
  onPickUrl,
}: {
  egsId: number;
  busy: boolean;
  onUseDefault: () => void;
  onPickUrl: (url: string) => void;
}) {
  const t = useT();
  const [candidates, setCandidates] = useState<EgsCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setCandidates(null);
    setError(null);
    fetch(`/api/egs-cover/${egsId}/candidates`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { candidates: EgsCandidate[] }) => setCandidates(d.candidates))
      .catch((e: Error) => {
        if (e.name === 'AbortError') return;
        setError(e.message);
      });
    return () => ctrl.abort();
  }, [egsId]);

  if (error) {
    return <p className="text-xs text-status-dropped">{error}</p>;
  }
  if (!candidates) {
    return <SkeletonBlock className="h-48 w-full" />;
  }

  return (
    <div className="space-y-3">
      <ul
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}
      >
        {candidates.map((c) => (
          <li key={c.source}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPickUrl(c.url)}
              className="flex w-full flex-col items-stretch gap-1 rounded-lg border border-border bg-bg-elev/30 p-1.5 text-left text-[11px] transition-colors hover:border-accent disabled:opacity-50"
              title={c.url}
            >
              <div className="aspect-[2/3] w-full overflow-hidden rounded-md bg-bg-elev">
                <SafeImage
                  src={c.url}
                  alt={c.label}
                  className="h-full w-full"
                />
              </div>
              <span className="line-clamp-1 px-0.5 text-center font-semibold text-muted">
                {c.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs">
        <button
          type="button"
          disabled={busy}
          onClick={onUseDefault}
          className="btn btn-primary"
          title={t.coverPicker.useEgsAutoHint}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {t.coverPicker.useEgsAuto}
        </button>
        <span className="text-muted">{t.coverPicker.egsCandidateHint}</span>
      </div>
    </div>
  );
}
