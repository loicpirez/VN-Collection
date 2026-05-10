'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ImageMinus, ImagePlus, Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

export function CoverUploader({ vnId, hasCustom }: { vnId: string; hasCustom: boolean }) {
  const t = useT();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/collection/${vnId}/cover`, { method: 'POST', body: fd });
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

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/collection/${vnId}/cover`, { method: 'DELETE' });
      if (!res.ok) throw new Error(t.cover.uploadError);
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <h3 className="mb-1 text-xs font-bold uppercase tracking-widest text-muted">{t.cover.title}</h3>
      <p className="mb-3 text-[11px] text-muted">{t.cover.hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = '';
        }}
      />
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={() => inputRef.current?.click()} disabled={busy || pending}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {busy ? t.cover.uploading : t.cover.uploadCta}
        </button>
        {hasCustom && (
          <button className="btn btn-danger" onClick={remove} disabled={busy || pending}>
            <ImageMinus className="h-4 w-4" /> {t.cover.remove}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-status-dropped">{error}</p>}
    </div>
  );
}
