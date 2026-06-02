'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';

import { readApiError } from '@/lib/api-error-read';
import { decodeCreatedSeriesId } from '@/lib/organizer-client-shape';
interface Suggestion {
  existing: { id: number; name: string }[];
  suggestedName: string | null;
  relatedInCollection: { id: string; title: string; relation: string }[];
}

interface Props {
  vnId: string;
  suggestion: Suggestion | null;
}

/**
 * Surfaces the series detector's output as a dismissable card on the VN
 * detail page. Two CTAs:
 *   - "Add to series X" - runs once per existing match.
 *   - "Create series Y" - POSTs a new series and links the VN.
 *
 * Either action makes the card disappear (router.refresh re-reads the
 * server-side suggestion which now reports null). User can also dismiss
 * the card outright; the dismissal is session-only - refresh re-shows it.
 */
export function SeriesAutoSuggest({ vnId, suggestion }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const identityRef = useRef<string | null>(vnId);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    identityRef.current = vnId;
    setDismissed(false);
    setBusy(null);
    return () => {
      identityRef.current = null;
      mutationInFlightRef.current = false;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
    };
  }, [vnId]);

  if (!suggestion || dismissed) return null;
  if (suggestion.existing.length === 0 && !suggestion.suggestedName) return null;
  const suggestedName = suggestion.suggestedName;

  async function joinExisting(seriesId: number) {
    if (mutationInFlightRef.current) return;
    const ownerVnId = vnId;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    mutationInFlightRef.current = true;
    setBusy(`join-${seriesId}`);
    try {
      const r = await fetch(`/api/series/${seriesId}/vn/${ownerVnId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expand: true }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.success(t.seriesAutoSuggest.added);
      startTransition(() => router.refresh());
    } catch (e) {
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((e as Error).message);
    } finally {
      if (identityRef.current === ownerVnId && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        setBusy(null);
      }
    }
  }

  async function createNew(suggestedName: string) {
    if (mutationInFlightRef.current) return;
    const ownerVnId = vnId;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    mutationInFlightRef.current = true;
    setBusy('create');
    try {
      const r = await fetch('/api/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: suggestedName }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const seriesId = decodeCreatedSeriesId(await r.json());
      if (!seriesId) throw new Error(t.common.error);
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      const link = await fetch(`/api/series/${seriesId}/vn/${ownerVnId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expand: true }),
        signal: controller.signal,
      });
      if (!link.ok) throw new Error(await readApiError(link, t.common.error));
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.success(t.seriesAutoSuggest.created);
      startTransition(() => router.refresh());
    } catch (e) {
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((e as Error).message);
    } finally {
      if (identityRef.current === ownerVnId && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        setBusy(null);
      }
    }
  }

  return (
    <section className="rounded-xl border border-accent/40 bg-accent/5 p-4 text-xs">
      <div className="mb-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          disabled={!!busy}
          aria-label={t.common.close}
          className="tap-target-tight rounded p-1 text-muted hover:text-white"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      </div>
      <p className="mb-3 text-white/85">
        {t.seriesAutoSuggest.hint}
        {suggestion.relatedInCollection.length > 0 && (
          <span className="ml-1 text-muted">
            ({suggestion.relatedInCollection.map((r) => r.title).join(' / ')})
          </span>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {suggestion.existing.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => joinExisting(s.id)}
            disabled={!!busy}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-bold text-bg disabled:opacity-50 sm:min-h-0"
          >
            {busy === `join-${s.id}` ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />}
            {t.seriesAutoSuggest.joinExisting}: {s.name}
          </button>
        ))}
        {suggestedName && (
          <button
            type="button"
            onClick={() => createNew(suggestedName)}
            disabled={!!busy}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-accent/60 bg-bg-card px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/15 disabled:opacity-50 sm:min-h-0"
          >
            {busy === 'create' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Plus className="h-3 w-3" aria-hidden />}
            {t.seriesAutoSuggest.createNew}: {suggestedName}
          </button>
        )}
      </div>
    </section>
  );
}
