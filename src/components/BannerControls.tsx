'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ImageMinus, ImagePlus, Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { ErrorAlert } from './ErrorAlert';
import { useToast } from './ToastProvider';
import { readApiError } from '@/lib/api-error-read';

interface Props {
  vnId: string;
  hasCustomBanner: boolean;
  variant?: 'card' | 'inline';
}

export function BannerControls({ vnId, hasCustomBanner, variant = 'card' }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const identityRef = useRef<string | null>(vnId);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    identityRef.current = vnId;
    setBusy(false);
    setError(null);
    return () => {
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      mutationInFlightRef.current = false;
      identityRef.current = null;
    };
  }, [vnId]);

  function beginMutation(): AbortController | null {
    if (mutationInFlightRef.current) return null;
    const controller = new AbortController();
    mutationInFlightRef.current = true;
    mutationAbortRef.current = controller;
    setBusy(true);
    setError(null);
    return controller;
  }

  function ownsMutation(ownerVnId: string, controller: AbortController): boolean {
    return identityRef.current === ownerVnId && mutationAbortRef.current === controller && !controller.signal.aborted;
  }

  function finishMutation(ownerVnId: string, controller: AbortController) {
    if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller) return;
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    setBusy(false);
  }

  async function upload(file: File) {
    const ownerVnId = vnId;
    const controller = beginMutation();
    if (!controller) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/collection/${ownerVnId}/banner`, { method: 'POST', body: fd, signal: controller.signal });
      if (!res.ok) throw new Error(await readApiError(res, t.common.error));
      if (!ownsMutation(ownerVnId, controller)) return;
      toast.success(t.toast.bannerSaved);
      startTransition(() => router.refresh());
    } catch (e) {
      if (!ownsMutation(ownerVnId, controller)) return;
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      finishMutation(ownerVnId, controller);
    }
  }

  async function reset() {
    const ownerVnId = vnId;
    const controller = beginMutation();
    if (!controller) return;
    try {
      const res = await fetch(`/api/collection/${ownerVnId}/banner`, { method: 'DELETE', signal: controller.signal });
      if (!res.ok) throw new Error(await readApiError(res, t.common.error));
      if (!ownsMutation(ownerVnId, controller)) return;
      toast.success(t.toast.bannerReset);
      startTransition(() => router.refresh());
    } catch (e) {
      if (!ownsMutation(ownerVnId, controller)) return;
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      finishMutation(ownerVnId, controller);
    }
  }

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      aria-hidden="true"
      tabIndex={-1}
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) upload(f);
        e.target.value = '';
      }}
    />
  );

  if (variant === 'inline') {
    return (
      <div className="flex flex-col items-start gap-1">
        {hiddenInput}
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy || pending}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/80 px-2.5 py-1 text-[11px] font-semibold text-muted shadow-card backdrop-blur transition-colors hover:border-accent hover:text-accent disabled:opacity-50 sm:min-h-0"
            title={t.banner.hint}
            data-menu-keep-open=""
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <ImagePlus className="h-3 w-3" aria-hidden />}
            {busy ? t.banner.uploadCta : t.banner.uploadCta}
          </button>
          {hasCustomBanner && (
            <button
              type="button"
              onClick={reset}
              disabled={busy || pending}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-status-dropped/50 bg-bg-elev/80 px-2.5 py-1 text-[11px] font-semibold text-status-dropped shadow-card backdrop-blur transition-colors hover:border-status-dropped hover:bg-status-dropped/10 disabled:opacity-50 sm:min-h-0"
            >
              <ImageMinus className="h-3 w-3" aria-hidden />
              {t.banner.reset}
            </button>
          )}
        </div>
        {error && <ErrorAlert title={t.common.error}>{error}</ErrorAlert>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <h3 className="mb-1 text-xs font-bold uppercase tracking-widest text-muted">{t.banner.title}</h3>
      <p className="mb-3 text-[11px] text-muted">{t.banner.hint}</p>
      {hiddenInput}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => inputRef.current?.click()} disabled={busy || pending}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
          {t.banner.uploadCta}
        </button>
        {hasCustomBanner && (
          <button type="button" className="btn btn-danger" onClick={reset} disabled={busy || pending}>
            <ImageMinus className="h-4 w-4" aria-hidden /> {t.banner.reset}
          </button>
        )}
      </div>
      {error && <div className="mt-2"><ErrorAlert title={t.common.error}>{error}</ErrorAlert></div>}
    </div>
  );
}
