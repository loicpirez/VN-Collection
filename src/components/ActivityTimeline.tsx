'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarCheck2,
  CalendarClock,
  Clock,
  FileText,
  Heart,
  History,
  Loader2,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import { useLocale, useT } from '@/lib/i18n/client';

type Kind = 'status' | 'rating' | 'playtime' | 'favorite' | 'started' | 'finished' | 'note' | 'manual';

interface Entry {
  id: number;
  vn_id: string;
  kind: Kind;
  payload: Record<string, unknown> | null;
  occurred_at: number;
}

const ICONS: Record<Kind, typeof History> = {
  status: History,
  rating: Star,
  playtime: Clock,
  favorite: Heart,
  started: CalendarClock,
  finished: CalendarCheck2,
  note: FileText,
  manual: FileText,
};

const LOCALE_BCP47: Record<string, string> = { fr: 'fr-FR', en: 'en-US', ja: 'ja-JP' };

function fmtDate(ts: number, locale: string): string {
  return new Date(ts).toLocaleString(LOCALE_BCP47[locale] ?? 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function summary(entry: Entry, t: ReturnType<typeof useT>): string {
  const p = entry.payload ?? {};
  switch (entry.kind) {
    case 'status':
      return `${t.activity.kind.status}: ${String(p.from ?? '—')} → ${String(p.to ?? '—')}`;
    case 'rating':
      return `${t.activity.kind.rating}: ${formatRating(p.from)} → ${formatRating(p.to)}`;
    case 'playtime': {
      const delta = typeof p.delta === 'number' ? p.delta : 0;
      const sign = delta > 0 ? '+' : '';
      return `${t.activity.kind.playtime}: ${sign}${delta} min (→ ${p.to} min)`;
    }
    case 'favorite':
      return p.to ? t.activity.kind.favoriteOn : t.activity.kind.favoriteOff;
    case 'started':
      return `${t.activity.kind.started}: ${String(p.to ?? '—')}`;
    case 'finished':
      return `${t.activity.kind.finished}: ${String(p.to ?? '—')}`;
    case 'note':
      return `${t.activity.kind.note} (${typeof p.length === 'number' ? p.length : 0} chars)`;
    case 'manual':
      return String(p.text ?? '');
  }
}

function formatRating(v: unknown): string {
  return typeof v === 'number' ? (v / 10).toFixed(1) : '—';
}

interface Props {
  vnId: string;
  initial: Entry[];
}

/**
 * Per-VN journal. The server hydrates `initial` so the section is non-empty
 * on first paint; the component then owns the optimistic state for adds /
 * deletes and a single refetch on demand. No polling — the assumption is
 * that the user is the only writer.
 */
export function ActivityTimeline({ vnId, initial }: Props) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>(initial);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  // Sync from server props when the underlying VN changes — keeps detail-page
  // navigation between VNs in the same session honest.
  useEffect(() => {
    setEntries(initial);
  }, [initial]);

  async function add() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/collection/${vnId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const data = (await r.json()) as { entry: Entry };
      setEntries((cur) => [data.entry, ...cur]);
      setText('');
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    const ok = await confirm({ message: t.activity.deleteConfirm, tone: 'danger' });
    if (!ok) return;
    try {
      const r = await fetch(`/api/collection/${vnId}/activity?entry=${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      setEntries((cur) => cur.filter((e) => e.id !== id));
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
      <h3 className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
        <History className="h-4 w-4 text-accent" /> {t.activity.title}
      </h3>

      <div className="mb-4 flex flex-wrap items-stretch gap-2">
        <input
          type="text"
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder={t.activity.placeholder}
          className="input min-w-[220px] flex-1"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || text.trim().length === 0}
          className="btn"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t.activity.add}
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-muted">{t.activity.empty}</p>
      ) : (
        <ol className="relative space-y-3 border-l border-border/60 pl-4">
          {entries.map((e) => {
            const Icon = ICONS[e.kind] ?? History;
            return (
              <li key={e.id} className="relative">
                <span className="absolute -left-[1.4rem] top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-bg-elev text-accent">
                  <Icon className="h-3 w-3" aria-hidden />
                </span>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="whitespace-pre-wrap text-xs text-white/85">{summary(e, t)}</p>
                  <span className="flex items-center gap-2 text-[10px] text-muted">
                    {fmtDate(e.occurred_at, locale)}
                    {e.kind === 'manual' && (
                      <button
                        type="button"
                        onClick={() => remove(e.id)}
                        className="rounded text-muted hover:text-status-dropped"
                        aria-label={t.common.delete}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
