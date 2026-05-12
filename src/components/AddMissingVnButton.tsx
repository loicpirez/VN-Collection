'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Plus } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';

/**
 * Small "+" affordance for missing-VN rows on the producer completion
 * panel. Triggers POST /api/collection/{vnId} with status=planning and
 * refreshes the surrounding server component so the row drops out of the
 * "missing" list. Designed to render inside a row that is itself a Link —
 * the button stops propagation so clicking it doesn't navigate.
 */
export function AddMissingVnButton({ vnId }: { vnId: string }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [, startTransition] = useTransition();

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy || done) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/collection/${vnId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'planning' }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.added);
      setDone(true);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || done}
      aria-label={t.toast.added}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center self-start rounded-md border border-border bg-bg-card text-muted transition-colors hover:border-accent hover:bg-accent hover:text-bg disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : done ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Plus className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
