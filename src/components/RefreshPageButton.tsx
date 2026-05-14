'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

/**
 * Re-fetch every page-level cache the browse / discovery pages depend
 * on (EGS anticipated, VNDB stats, upcoming releases, etc.) and then
 * router.refresh() the current page so the server components re-render
 * with the new data. Standalone button — drops in on /producers,
 * /tags, /traits, /upcoming, /stats, /data, /year, /quotes,
 * /brand-overlap, /recommendations, /shelf, /similar.
 */
export function RefreshPageButton({ className = '' }: { className?: string } = {}) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function run() {
    setBusy(true);
    try {
      const r = await fetch('/api/refresh/global', { method: 'POST' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const body = (await r.json()) as { done: number; failed: number; total: number };
      if (body.failed > 0) {
        toast.error(t.refreshPage.partial
          .replace('{done}', String(body.done))
          .replace('{total}', String(body.total)));
      } else {
        toast.success(t.refreshPage.done);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className={`btn ${className}`}
      title={t.refreshPage.title}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {t.refreshPage.cta}
    </button>
  );
}
