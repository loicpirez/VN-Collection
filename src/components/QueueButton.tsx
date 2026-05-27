'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ListOrdered, Loader2, Plus } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

import { readApiError } from '@/lib/api-error-read';
/**
 * Toggle button: adds / removes the VN from the user's reading queue.
 * Lives next to the download buttons on /vn/[id].
 *
 * Reads the queue once on mount to decide which state to surface — the
 * server-side render already paints the queue list elsewhere so the extra
 * round-trip is harmless and keeps this component self-contained.
 */
export function QueueButton({ vnId }: { vnId: string }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [queued, setQueued] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    fetch('/api/reading-queue', { cache: 'no-store', signal: ac.signal })
      .then((r) => r.json())
      .then((d: { entries: { vn_id: string }[] }) => {
        setQueued(d.entries.some((e) => e.vn_id === vnId));
      })
      .catch(() => undefined);
    return () => ac.abort();
  }, [vnId]);

  async function toggle() {
    setBusy(true);
    try {
      if (queued) {
        const r = await fetch(`/api/reading-queue?vn_id=${vnId}`, { method: 'DELETE' });
        if (!r.ok) throw new Error(t.common.error);
        setQueued(false);
      } else {
        const r = await fetch('/api/reading-queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vn_id: vnId }),
        });
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        setQueued(true);
      }
      toast.success(t.toast.saved);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        queued
          ? 'border-accent bg-accent text-bg hover:bg-accent/90'
          : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-white'
      }`}
      title={queued ? t.readingQueue.removeCta : t.readingQueue.addCta}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : queued ? <ListOrdered className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      {queued ? t.readingQueue.removeCta : t.readingQueue.addCta}
    </button>
  );
}
