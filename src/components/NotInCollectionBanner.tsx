'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PackagePlus } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { readApiError } from '@/lib/api-error-read';

/**
 * Inline banner shown at the top of `/vn/[id]` whenever the VN is
 * visible (has a row in the `vn` cache table) but is NOT in the
 * local collection.
 *
 * Renders a short status line plus a primary "Add to collection"
 * CTA that POSTs to `/api/collection/<id>` and refreshes the page.
 * Used in conjunction with the action-bar regrouping that disables
 * Collection-only actions while keeping Data / Mapping / External
 * actions enabled - see `VnDetailActionsBar.tsx`.
 *
 * The banner is intentionally minimal - it sits ABOVE the hero
 * banner and reads like a contextual hint, not a modal. Dismissing
 * it isn't possible: the banner reflects DB state, so the only way
 * to make it disappear is to add the VN.
 */
export function NotInCollectionBanner({ vnId }: { vnId: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const identityRef = useRef<string | null>(vnId);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);
  useEffect(() => {
    identityRef.current = vnId;
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    setBusy(false);
    setError(null);
    setAdded(false);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    return () => {
      identityRef.current = null;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [vnId]);

  async function add(): Promise<void> {
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    const controller = new AbortController();
    mutationAbortRef.current = controller;
    const ownerVnId = vnId;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/collection/${vnId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setAdded(true);
      window.dispatchEvent(new CustomEvent('vn:collection-changed', { detail: { vnId: ownerVnId } }));
      startTransition(() => router.refresh());
      refreshTimerRef.current = setTimeout(() => {
        if (identityRef.current === ownerVnId) router.refresh();
      }, 250);
    } catch (e) {
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || (e instanceof Error && e.name === 'AbortError')) return;
      setError((e as Error).message);
    } finally {
      if (identityRef.current === ownerVnId && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        setBusy(false);
      }
    }
  }

  const working = busy || pending;
  if (added) return null;
  return (
    <div
      role="status"
      className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs"
    >
      <span className="inline-flex items-center gap-1.5 text-muted">
        <PackagePlus className="h-3.5 w-3.5 text-accent" aria-hidden />
        <span>{t.detail.notInLibraryBanner.label}</span>
      </span>
      <button
        type="button"
        className="btn btn-primary btn-xs"
        onClick={add}
        disabled={working}
      >
        {working ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
        {t.detail.notInLibraryBanner.cta}
      </button>
      <span className="text-muted/70">{t.detail.notInLibraryBanner.hint}</span>
      {error && <span role="alert" className="text-status-dropped">{error}</span>}
    </div>
  );
}
