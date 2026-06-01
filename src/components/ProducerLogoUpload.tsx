'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ImageMinus, ImagePlus, Loader2, RefreshCw } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { readApiError } from '@/lib/api-error-read';

interface Props {
  producerId: string;
  hasLogo: boolean;
}

export function ProducerLogoUpload({ producerId, hasLogo }: Props) {
  const t = useT();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const identityRef = useRef<string | null>(producerId);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    identityRef.current = producerId;
    setBusy(false);
    setError(null);
    setInfo(null);
    if (inputRef.current) inputRef.current.value = '';
    return () => {
      identityRef.current = null;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      mutationInFlightRef.current = false;
    };
  }, [producerId]);

  function startMutation(): AbortController | null {
    if (mutationInFlightRef.current) return null;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    mutationInFlightRef.current = true;
    return controller;
  }

  function ownsMutation(ownerProducerId: string, controller: AbortController): boolean {
    return identityRef.current === ownerProducerId
      && mutationAbortRef.current === controller
      && !controller.signal.aborted;
  }

  function finishMutation(ownerProducerId: string, controller: AbortController) {
    if (mutationAbortRef.current !== controller) return;
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    if (identityRef.current === ownerProducerId) setBusy(false);
  }

  async function handleUpload(file: File) {
    const ownerProducerId = producerId;
    const controller = startMutation();
    if (!controller) return;
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/producer/${ownerProducerId}/logo`, { method: 'POST', body: fd, signal: controller.signal });
      if (!res.ok) throw new Error(await readApiError(res, t.cover.uploadError));
      if (!ownsMutation(ownerProducerId, controller)) return;
      startTransition(() => router.refresh());
    } catch (e) {
      if (!ownsMutation(ownerProducerId, controller)) return;
      setError((e as Error).message);
    } finally {
      finishMutation(ownerProducerId, controller);
    }
  }

  async function handleRemove() {
    const ownerProducerId = producerId;
    const controller = startMutation();
    if (!controller) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/producer/${ownerProducerId}/logo`, { method: 'DELETE', signal: controller.signal });
      if (!res.ok) throw new Error(await readApiError(res, t.cover.uploadError));
      if (!ownsMutation(ownerProducerId, controller)) return;
      startTransition(() => router.refresh());
    } catch (e) {
      if (!ownsMutation(ownerProducerId, controller)) return;
      setError((e as Error).message);
    } finally {
      finishMutation(ownerProducerId, controller);
    }
  }

  async function handleRefetch() {
    const ownerProducerId = producerId;
    const controller = startMutation();
    if (!controller) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/producer/${ownerProducerId}`, { cache: 'no-store', signal: controller.signal });
      if (!res.ok) throw new Error(await readApiError(res, t.common.error));
      if (!ownsMutation(ownerProducerId, controller)) return;
      setInfo(t.producers.fetched);
      startTransition(() => router.refresh());
    } catch (e) {
      if (!ownsMutation(ownerProducerId, controller)) return;
      setError((e as Error).message);
    } finally {
      finishMutation(ownerProducerId, controller);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        className="btn"
        onClick={() => inputRef.current?.click()}
        disabled={busy || pending}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
        {t.producers.uploadLogo}
      </button>
      {hasLogo && (
        <button type="button" className="btn btn-danger" onClick={handleRemove} disabled={busy || pending}>
          <ImageMinus className="h-4 w-4" aria-hidden /> {t.producers.removeLogo}
        </button>
      )}
      <button type="button" className="btn" onClick={handleRefetch} disabled={busy || pending}>
        <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden /> {t.producers.fetchInfo}
      </button>
      {error && <span role="alert" className="text-sm text-status-dropped">{error}</span>}
      {info && <span role="status" className="text-sm text-status-completed">{info}</span>}
    </div>
  );
}
