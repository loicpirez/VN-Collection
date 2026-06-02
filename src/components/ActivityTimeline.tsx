'use client';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
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
import type { Locale } from '@/lib/i18n/dictionaries';
import { BCP47, fmtDate as fmtDateShared } from '@/lib/locale-number';

import { readApiError } from '@/lib/api-error-read';
import {
  decodeActivityEntryResponse,
  type TrackingActivityEntry as Entry,
  type TrackingActivityKind as Kind,
} from '@/lib/tracking-client-shape';

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

function fmtDate(ts: number, locale: string): string {
  return fmtDateShared(new Date(ts), locale as Locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function Arrow() {
  return <ArrowRight className="inline-block h-3 w-3 align-middle" aria-hidden />;
}

function summary(entry: Entry, t: ReturnType<typeof useT>, locale: Locale): ReactNode {
  const p = entry.payload ?? {};
  switch (entry.kind) {
    case 'status':
      return (
        <>
          {t.activity.kind.status}: {String(p.from ?? '-')} <Arrow /> {String(p.to ?? '-')}
        </>
      );
    case 'rating':
      return (
        <>
          {t.activity.kind.rating}: {formatRating(p.from, locale)} <Arrow /> {formatRating(p.to, locale)}
        </>
      );
    case 'playtime': {
      const delta = typeof p.delta === 'number' ? p.delta : 0;
      const sign = delta > 0 ? '+' : '';
      return (
        <>
          {t.activity.kind.playtime}: {sign}{delta} min (<Arrow /> {String(p.to)} min)
        </>
      );
    }
    case 'favorite':
      return p.to ? t.activity.kind.favoriteOn : t.activity.kind.favoriteOff;
    case 'started':
      return `${t.activity.kind.started}: ${String(p.to ?? '-')}`;
    case 'finished':
      return `${t.activity.kind.finished}: ${String(p.to ?? '-')}`;
    case 'note':
      return `${t.activity.kind.note} (${typeof p.length === 'number' ? p.length : 0} ${t.userActivity.noteChars})`;
    case 'manual':
      return String(p.text ?? '');
    default: {
      const _exhaustive: never = entry.kind;
      return String(_exhaustive);
    }
  }
}

function formatRating(v: unknown, locale: Locale): string {
  if (typeof v !== 'number') return '-';
  return (v / 10).toLocaleString(BCP47[locale] ?? 'en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

interface Props {
  vnId: string;
  initial: Entry[];
}

/**
 * Per-VN journal. The server hydrates `initial` so the section is non-empty
 * on first paint; the component then owns the optimistic state for adds /
 * deletes and a single refetch on demand. No polling - the assumption is
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
  const identityRef = useRef<string | null>(vnId);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);

  // Sync from server props when the underlying VN changes - keeps detail-page
  // navigation between VNs in the same session honest.
  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    identityRef.current = vnId;
    setEntries(initial);
    setText('');
    setBusy(false);
    return () => {
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      mutationInFlightRef.current = false;
      identityRef.current = null;
    };
  }, [vnId, initial]);

  function beginMutation(): AbortController | null {
    if (mutationInFlightRef.current) return null;
    const controller = new AbortController();
    mutationInFlightRef.current = true;
    mutationAbortRef.current = controller;
    setBusy(true);
    return controller;
  }

  function ownsMutation(ownerVnId: string, controller: AbortController): boolean {
    return identityRef.current === ownerVnId && mutationAbortRef.current === controller && !controller.signal.aborted;
  }

  function finishMutation(ownerVnId: string, controller: AbortController) {
    if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller) return;
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    setBusy(false);
  }

  async function add() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const ownerVnId = vnId;
    const controller = beginMutation();
    if (!controller) return;
    try {
      const r = await fetch(`/api/collection/${ownerVnId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const entry = decodeActivityEntryResponse(await r.json());
      if (!entry) throw new Error(t.common.error);
      if (!ownsMutation(ownerVnId, controller)) return;
      setEntries((cur) => [entry, ...cur]);
      setText('');
      startTransition(() => router.refresh());
    } catch (e) {
      if (!ownsMutation(ownerVnId, controller)) return;
      toast.error((e as Error).message);
    } finally {
      finishMutation(ownerVnId, controller);
    }
  }

  async function remove(id: number) {
    const ownerVnId = vnId;
    const controller = beginMutation();
    if (!controller) return;
    const ok = await confirm({ message: t.activity.deleteConfirm, tone: 'danger' });
    if (!ok || !ownsMutation(ownerVnId, controller)) {
      finishMutation(ownerVnId, controller);
      return;
    }
    try {
      const r = await fetch(`/api/collection/${ownerVnId}/activity?entry=${id}`, {
        method: 'DELETE',
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (!ownsMutation(ownerVnId, controller)) return;
      setEntries((cur) => cur.filter((e) => e.id !== id));
      startTransition(() => router.refresh());
    } catch (e) {
      if (!ownsMutation(ownerVnId, controller)) return;
      toast.error((e as Error).message);
    } finally {
      finishMutation(ownerVnId, controller);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
      <h3 className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
        <History className="h-4 w-4 text-accent" aria-hidden /> {t.activity.title}
      </h3>

      <div className="mb-4 flex flex-wrap items-stretch gap-2">
        <input
          type="text"
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder={t.activity.placeholder}
          aria-label={t.activity.placeholder}
          className="input min-w-[160px] sm:min-w-[220px] flex-1"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || text.trim().length === 0}
          className="btn"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
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
                  <p className="whitespace-pre-wrap text-xs text-white/85">{summary(e, t, locale)}</p>
                  <span className="flex items-center gap-2 text-[10px] text-muted">
                    {fmtDate(e.occurred_at, locale)}
                    {e.kind === 'manual' && (
                      <button
                        type="button"
                        onClick={() => remove(e.id)}
                        disabled={busy}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted hover:text-status-dropped sm:min-h-0 sm:min-w-0"
                        aria-label={t.common.delete}
                      >
                        <Trash2 className="h-3 w-3" aria-hidden />
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
