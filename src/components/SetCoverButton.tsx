'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ImageDown, Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface Props {
  vnId: string;
  /** A storage-relative path (preferred) OR a URL. */
  value: string;
  /** Source label kept for the API. */
  source?: 'screenshot' | 'release' | 'url' | 'path';
  className?: string;
}

/**
 * Mirror of <SetBannerButton/> for the cover. Lets the user pick any
 * screenshot, release art or external URL and store it as the custom
 * cover for that VN. The cover selector on /vn/[id] then picks it up
 * automatically (VNDB / EGS / Custom toggle), so we get full
 * round-trip support without ever needing a file upload.
 */
export function SetCoverButton({ vnId, value, source = 'path', className = '' }: Props) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/collection/${vnId}/cover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, value }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t.common.error);
      }
      setDone(true);
      startTransition(() => router.refresh());
      setTimeout(() => setDone(false), 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={set}
      disabled={busy || pending}
      className={`inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[11px] font-semibold text-white shadow backdrop-blur-sm transition-opacity hover:bg-accent hover:text-bg ${className}`}
      title={error ?? t.coverActions.setAs}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageDown className="h-3 w-3" />}
      {done ? t.coverActions.set : t.coverActions.setAs}
    </button>
  );
}
