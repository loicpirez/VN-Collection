'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ImageMinus, ImagePlus, Loader2, RefreshCw } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

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

  async function handleUpload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/producer/${producerId}/logo`, { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t.cover.uploadError);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/producer/${producerId}/logo`, { method: 'DELETE' });
      if (!res.ok) throw new Error(t.cover.uploadError);
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRefetch() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/producer/${producerId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(t.common.error);
      setInfo(t.producers.fetched);
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
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
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        {t.producers.uploadLogo}
      </button>
      {hasLogo && (
        <button type="button" className="btn btn-danger" onClick={handleRemove} disabled={busy || pending}>
          <ImageMinus className="h-4 w-4" /> {t.producers.removeLogo}
        </button>
      )}
      <button type="button" className="btn" onClick={handleRefetch} disabled={busy || pending}>
        <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> {t.producers.fetchInfo}
      </button>
      {error && <span className="text-sm text-status-dropped">{error}</span>}
      {info && <span className="text-sm text-status-completed">{info}</span>}
    </div>
  );
}
