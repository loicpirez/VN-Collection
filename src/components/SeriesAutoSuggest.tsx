'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, Check, Loader2, Plus, X } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';

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
 *   - "Add to series X" — runs once per existing match.
 *   - "Create series Y" — POSTs a new series and links the VN.
 *
 * Either action makes the card disappear (router.refresh re-reads the
 * server-side suggestion which now reports null). User can also dismiss
 * the card outright; the dismissal is session-only — refresh re-shows it.
 */
export function SeriesAutoSuggest({ vnId, suggestion }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (!suggestion || dismissed) return null;
  if (suggestion.existing.length === 0 && !suggestion.suggestedName) return null;

  async function joinExisting(seriesId: number) {
    setBusy(`join-${seriesId}`);
    try {
      const r = await fetch(`/api/series/${seriesId}/vn/${vnId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expand: true }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.seriesAutoSuggest.added);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function createNew() {
    if (!suggestion?.suggestedName) return;
    setBusy('create');
    try {
      const r = await fetch('/api/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: suggestion.suggestedName }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const data = (await r.json()) as { series: { id: number } };
      const link = await fetch(`/api/series/${data.series.id}/vn/${vnId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expand: true }),
      });
      if (!link.ok) throw new Error((await link.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.seriesAutoSuggest.created);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-accent/40 bg-accent/5 p-4 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-bold uppercase tracking-widest text-accent">
          <Bookmark className="h-4 w-4" /> {t.seriesAutoSuggest.title}
        </span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t.common.close}
          className="rounded text-muted hover:text-white"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <p className="mb-3 text-white/85">
        {t.seriesAutoSuggest.hint}
        {suggestion.relatedInCollection.length > 0 && (
          <span className="ml-1 text-muted">
            ({suggestion.relatedInCollection.map((r) => r.title).join(' · ')})
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
            className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-bold text-bg disabled:opacity-50"
          >
            {busy === `join-${s.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {t.seriesAutoSuggest.joinExisting}: {s.name}
          </button>
        ))}
        {suggestion.suggestedName && (
          <button
            type="button"
            onClick={createNew}
            disabled={!!busy}
            className="inline-flex items-center gap-1 rounded-md border border-accent/60 bg-bg-card px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/15 disabled:opacity-50"
          >
            {busy === 'create' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            {t.seriesAutoSuggest.createNew}: {suggestion.suggestedName}
          </button>
        )}
      </div>
    </section>
  );
}
