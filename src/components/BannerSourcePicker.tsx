'use client';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useDialogA11y } from './Dialog';
import { useRouter } from 'next/navigation';
import { Check, Image as ImageIcon, ImagePlus, Link as LinkIcon, Loader2, RotateCcw, X } from 'lucide-react';
import { SafeImage } from './SafeImage';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import type { ReleaseImage, Screenshot } from '@/lib/types';

interface Props {
  vnId: string;
  /** Current custom banner path/URL — null when none is set. */
  currentBanner: string | null;
  /** VN cover (used as the "default" backdrop). */
  coverRemote: string | null;
  coverLocal: string | null;
  coverSexual: number | null;
  screenshots: Screenshot[];
  releaseImages: ReleaseImage[];
}

type Tab = 'default' | 'custom';

/**
 * Banner-source picker mirroring CoverSourcePicker, with two tabs:
 *
 *   1. **Default** — clear the custom banner and let the page fall
 *      back to the cover-derived blurred backdrop.
 *   2. **Custom** — file upload, paste a URL, *or* pick from any image
 *      already attached to the VN (screenshots + per-release art).
 *
 * Sits next to the existing BannerControls / SetBannerButton — those
 * remain the minimal inline path; this modal is the rich UX.
 */
export function BannerSourcePicker({
  vnId,
  currentBanner,
  coverRemote,
  coverLocal,
  coverSexual,
  screenshots,
  releaseImages,
}: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Default to Custom — the picker exists mostly so users can upload /
  // paste / pick from gallery. Resetting to default is a single click
  // from the Custom tab anyway.
  const [tab, setTab] = useState<Tab>('custom');
  const [busy, setBusy] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const [, startTransition] = useTransition();

  useDialogA11y({ open, onClose: () => setOpen(false), panelRef: dialogRef });

  async function applySource(source: 'url' | 'screenshot' | 'release' | 'path' | 'cover', value?: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/collection/${vnId}/banner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value ? { source, value } : { source }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.bannerSaved);
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resetBanner() {
    setBusy(true);
    try {
      const r = await fetch(`/api/collection/${vnId}/banner`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.bannerReset);
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
      const r = await fetch(`/api/collection/${vnId}/banner`, { method: 'POST', body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.bannerSaved);
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
      aspect: 'aspect-video' as const,
    })),
    ...releaseImages.map((img) => ({
      key: `${img.release_id}-${img.id ?? img.url}`,
      src: img.thumbnail || img.url,
      local: img.local_thumb || img.local || null,
      value: img.local || img.url,
      source: 'release' as const,
      sexual: img.sexual ?? null,
      label: `${img.type} · ${img.release_title}`,
      aspect: img.type === 'pkgmed' ? ('aspect-square' as const) : ('aspect-[2/3]' as const),
    })),
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn"
        title={t.bannerPicker.openTitle}
      >
        <ImageIcon className="h-4 w-4" />
        {t.bannerPicker.open}
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
              <h2 id={titleId} className="text-base font-bold">{t.bannerPicker.title}</h2>
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
              <TabButton active={tab === 'custom'} onClick={() => setTab('custom')}>
                {t.coverPicker.custom}
              </TabButton>
              <TabButton active={tab === 'default'} onClick={() => setTab('default')}>
                {t.bannerPicker.defaultTab}
              </TabButton>
            </nav>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {tab === 'default' && (
                <section className="text-sm">
                  <p className="mb-3 text-xs text-muted">{t.bannerPicker.defaultHint}</p>
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="h-32 w-56 shrink-0 overflow-hidden rounded-lg border border-border bg-bg-elev">
                      <SafeImage src={coverRemote} localSrc={coverLocal} alt="cover" sexual={coverSexual} className="h-full w-full" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={resetBanner}
                        disabled={busy || !currentBanner}
                        className="btn btn-primary"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        {t.bannerPicker.useDefault}
                      </button>
                      <button
                        type="button"
                        onClick={() => applySource('cover')}
                        disabled={busy}
                        className="btn"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                        {t.bannerPicker.useCover}
                      </button>
                      {!currentBanner && (
                        <p className="text-[11px] text-muted">{t.bannerPicker.alreadyDefault}</p>
                      )}
                    </div>
                  </div>
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
                          const isCurrent = currentBanner === it.value;
                          return (
                            <button
                              key={it.key}
                              type="button"
                              onClick={() => applySource(it.source, it.value)}
                              disabled={busy}
                              className={`group relative ${it.aspect} overflow-hidden rounded-md border bg-bg-elev transition-colors ${
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
