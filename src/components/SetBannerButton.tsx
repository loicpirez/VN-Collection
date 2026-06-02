'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ImageUp, Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { readApiError } from '@/lib/api-error-read';

interface Props {
  vnId: string;
  /** A storage-relative path (preferred) OR a URL. */
  value: string;
  /** Optional source label, kept for the API. */
  source?: 'screenshot' | 'release' | 'cover' | 'custom_cover' | 'url' | 'path';
  className?: string;
}

export function SetBannerButton({ vnId, value, source = 'path', className = '' }: Props) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const identityRef = useRef<string | null>(vnId);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    identityRef.current = vnId;
    setBusy(false);
    setDone(false);
    setError(null);
    if (doneTimer.current) clearTimeout(doneTimer.current);
    return () => {
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      mutationInFlightRef.current = false;
      identityRef.current = null;
      if (doneTimer.current) clearTimeout(doneTimer.current);
    };
  }, [vnId]);

  async function set(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (mutationInFlightRef.current) return;
    const ownerVnId = vnId;
    const controller = new AbortController();
    mutationInFlightRef.current = true;
    mutationAbortRef.current = controller;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/collection/${ownerVnId}/banner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, value }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(await readApiError(res, t.common.error));
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setDone(true);
      startTransition(() => router.refresh());
      if (doneTimer.current) clearTimeout(doneTimer.current);
      doneTimer.current = setTimeout(() => {
        if (identityRef.current === ownerVnId) setDone(false);
      }, 1500);
    } catch (err) {
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setError((err as Error).message);
    } finally {
      if (identityRef.current === ownerVnId && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={set}
      disabled={busy || pending}
      className={`tap-target inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[11px] font-semibold text-white shadow backdrop-blur-sm transition-opacity hover:bg-accent hover:text-bg ${className}`}
      title={error ?? t.banner.setAs}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <ImageUp className="h-3 w-3" aria-hidden />}
      {done ? t.banner.set : t.banner.setAs}
    </button>
  );
}
