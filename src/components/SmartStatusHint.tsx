'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { isoCalendarDay } from '@/lib/locale-number';
import { useToast } from './ToastProvider';

import { readApiError } from '@/lib/api-error-read';
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
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const identityRef = useRef<string | null>(vnId);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);

  useEffect(() => {
    identityRef.current = vnId;
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    setDismissed(false);
    setBusy(false);
    return () => {
      identityRef.current = null;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
    };
  }, [vnId]);

  const shouldShow = status === 'playing'
    && (playtimeMinutes ?? 0) > 0
    && (vndbLengthMinutes ?? 0) > 0
    && (playtimeMinutes ?? 0) >= (vndbLengthMinutes ?? 0)
    && !dismissed;
  if (!shouldShow) return null;

  async function markComplete() {
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    const controller = new AbortController();
    mutationAbortRef.current = controller;
    const ownerVnId = vnId;
    setBusy(true);
    try {
      const r = await fetch(`/api/collection/${vnId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', finished_date: isoCalendarDay(new Date(), locale) }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.success(t.toast.saved);
      startTransition(() => router.refresh());
    } catch (e) {
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || (e instanceof Error && e.name === 'AbortError')) return;
      toast.error((e as Error).message);
    } finally {
      if (identityRef.current === ownerVnId && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        setBusy(false);
      }
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
          className="min-h-[44px] rounded-md bg-accent px-2 py-1 font-bold text-bg disabled:opacity-50 sm:min-h-0"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : t.smartStatus.markCompleted}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="tap-target inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted hover:text-white"
          aria-label={t.common.close}
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      </span>
    </aside>
  );
}
