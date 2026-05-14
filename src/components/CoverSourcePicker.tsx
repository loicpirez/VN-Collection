'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ImagePlus, Link as LinkIcon, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import { SafeImage } from './SafeImage';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import type { ReleaseImage, Screenshot } from '@/lib/types';

interface Props {
  vnId: string;
  /** VNDB's default image URL — clicking "use VNDB" clears any override. */
  vndbImage: string | null;
  /** EGS numeric id — when set, the EGS tab is enabled and points to /api/egs-cover/<id>. */
  egsId: number | null;
  /** Current custom cover string (path / URL) — drives the "current" visual marker. */
  currentCustomCover: string | null;
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
  screenshots,
  releaseImages,
}: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(initialTab(egsId, currentCustomCover));
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [urlValue, setUrlValue] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', esc);
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function applySource(source: 'url' | 'screenshot' | 'release' | 'path', value: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/collection/${vnId}/cover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, value }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
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
      const r = await fetch(`/api/collection/${vnId}/cover`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.coverReset);
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
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
      label: `Screenshot ${i + 1}`,
    })),
    ...releaseImages.map((img) => ({
      key: `${img.release_id}-${img.id ?? img.url}`,
      src: img.thumbnail || img.url,
      local: img.local_thumb || img.local || null,
      value: img.local || img.url,
      source: 'release' as const,
      sexual: img.sexual ?? null,
      label: `${img.type} · ${img.release_title}`,
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
            className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-bg-card shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-base font-bold">{t.coverPicker.title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted hover:bg-bg-elev hover:text-white"
                aria-label={t.common.close}
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <nav className="flex border-b border-border">
              <TabButton active={tab === 'vndb'} onClick={() => setTab('vndb')}>VNDB</TabButton>
              <TabButton active={tab === 'egs'} onClick={() => setTab('egs')} disabled={!egsId}>
                EGS
              </TabButton>
              <TabButton active={tab === 'custom'} onClick={() => setTab('custom')}>
                {t.coverPicker.custom}
              </TabButton>
            </nav>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {tab === 'vndb' && (
                <section className="text-sm">
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
                <section className="text-sm">
                  <p className="mb-3 text-xs text-muted">{t.coverPicker.egsHint}</p>
                  {egsId ? (
                    <div className="flex flex-wrap items-start gap-4">
                      <div className="h-48 w-32 shrink-0 overflow-hidden rounded-lg border border-border bg-bg-elev">
                        <SafeImage src={`/api/egs-cover/${egsId}`} alt="EGS" className="h-full w-full" />
                      </div>
                      <div className="flex-1">
                        <button
                          type="button"
                          onClick={() => applySource('url', `/api/egs-cover/${egsId}`)}
                          disabled={busy}
                          className="btn btn-primary"
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                          {t.coverPicker.useEgs}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted">{t.coverPicker.noEgs}</p>
                  )}
                </section>
              )}
              {tab === 'custom' && (
                <section className="space-y-4 text-sm">
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
                        type="text"
                        value={urlValue}
                        onChange={(e) => setUrlValue(e.target.value)}
                        placeholder="https://…"
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
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
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

function initialTab(egsId: number | null, currentCustom: string | null): Tab {
  if (currentCustom && /^\/api\/egs-cover\//.test(currentCustom)) return 'egs';
  if (currentCustom) return 'custom';
  return 'vndb';
}
