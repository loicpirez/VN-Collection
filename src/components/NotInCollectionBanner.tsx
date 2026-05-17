'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PackagePlus } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

/**
 * Inline banner shown at the top of `/vn/[id]` whenever the VN is
 * visible (has a row in the `vn` cache table) but is NOT in the
 * local collection.
 *
 * Renders a short status line plus a primary "Add to collection"
 * CTA that POSTs to `/api/collection/<id>` and refreshes the page.
 * Used in conjunction with the action-bar regrouping that disables
 * Collection-only actions while keeping Data / Mapping / External
 * actions enabled — see `VnDetailActionsBar.tsx`.
 *
 * The banner is intentionally minimal — it sits ABOVE the hero
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

  async function add(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/collection/${vnId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || t.common.error);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const working = busy || pending;
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
        className="btn btn-primary !py-1 !text-xs"
        onClick={add}
        disabled={working}
      >
        {working ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
        {t.detail.notInLibraryBanner.cta}
      </button>
      <span className="text-muted/70">{t.detail.notInLibraryBanner.hint}</span>
      {error && <span className="text-status-dropped">{error}</span>}
    </div>
  );
}
