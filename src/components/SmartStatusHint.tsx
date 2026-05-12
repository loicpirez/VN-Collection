'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

interface Props {
  vnId: string;
  status: string | null | undefined;
  playtimeMinutes: number | null | undefined;
  vndbLengthMinutes: number | null | undefined;
}

/**
 * Non-intrusive banner: "you've logged ≥ VNDB length — mark as completed?".
 * Only renders when the user is `playing`, has logged some time, and is
 * at or above the community length estimate. Dismiss is session-local so
 * a refresh re-surfaces it; auto-hides once the user confirms.
 */
export function SmartStatusHint({ vnId, status, playtimeMinutes, vndbLengthMinutes }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const shouldShow = status === 'playing'
    && (playtimeMinutes ?? 0) > 0
    && (vndbLengthMinutes ?? 0) > 0
    && (playtimeMinutes ?? 0) >= (vndbLengthMinutes ?? 0)
    && !dismissed;
  if (!shouldShow) return null;

  async function markComplete() {
    setBusy(true);
    try {
      const r = await fetch(`/api/collection/${vnId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', finished_date: new Date().toISOString().slice(0, 10) }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.saved);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent/40 bg-accent/5 px-4 py-2 text-xs">
      <span className="inline-flex items-center gap-2 text-accent">
        <CheckCircle2 className="h-4 w-4" /> {t.smartStatus.hint}
      </span>
      <span className="flex items-center gap-1">
        <button
          type="button"
          onClick={markComplete}
          disabled={busy}
          className="rounded-md bg-accent px-2 py-1 font-bold text-bg disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : t.smartStatus.markCompleted}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded text-muted hover:text-white"
          aria-label={t.common.close}
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    </aside>
  );
}
