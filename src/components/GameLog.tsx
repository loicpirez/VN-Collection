'use client';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpenText, Check, Clock, Loader2, Pencil, Send, Sparkles, Trash2, X } from 'lucide-react'
import { useLocale, useT } from '@/lib/i18n/client';
import { BCP47 } from '@/lib/locale-number';
import type { Locale } from '@/lib/i18n/dictionaries';
import { timeAgo } from '@/lib/time-ago';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';

import { readApiError } from '@/lib/api-error-read';
import { decodeGameLogEntryResponse, type TrackingGameLogEntry } from '@/lib/tracking-client-shape';

type GameLogEntry = TrackingGameLogEntry;

const NOTE_MAX = 8000;

interface Props {
  vnId: string;
  initial: GameLogEntry[];
  /**
   * The PomodoroTimer publishes its currently-elapsed minute count here
   * (via a sibling state lifted in the parent). When > 0 the user can
   * stamp the new note with "logged 23m into a session" in one click.
   */
  liveSessionMinutes?: number;
}

/**
 * Per-VN free-form journal. Each entry is a timestamped note
 * (route progress, plot beats, …) - separate from the activity
 * log which tracks state changes. Lives next to the Pomodoro
 * timer on the detail page and can attach the live session length to
 * a new entry in one click.
 */
export function GameLog({ vnId, initial, liveSessionMinutes = 0 }: Props) {
  const t = useT();
  const { confirm } = useConfirm();
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const [entries, setEntries] = useState<GameLogEntry[]>(initial);
  const [text, setText] = useState('');
  const [attachSession, setAttachSession] = useState(false);
  const [busy, setBusy] = useState<'add' | 'edit' | 'remove' | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const identityRef = useRef<string | null>(vnId);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    identityRef.current = vnId;
    setEntries(initial);
    setText('');
    setAttachSession(false);
    setBusy(null);
    setEditingId(null);
    setEditingText('');
    setSavingEdit(false);
    return () => {
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      mutationInFlightRef.current = false;
      identityRef.current = null;
    };
  }, [vnId, initial]);

  useEffect(() => {
    if (liveSessionMinutes <= 0) setAttachSession(false);
  }, [liveSessionMinutes]);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const remaining = NOTE_MAX - text.length;
  const counterLabel = t.gameLog.counter
    .replace('{n}', String(text.length))
    .replace('{max}', String(NOTE_MAX));

  function beginMutation(kind: 'add' | 'edit' | 'remove'): AbortController | null {
    if (mutationInFlightRef.current) return null;
    const controller = new AbortController();
    mutationInFlightRef.current = true;
    mutationAbortRef.current = controller;
    setBusy(kind);
    if (kind === 'edit') setSavingEdit(true);
    return controller;
  }

  function ownsMutation(ownerVnId: string, controller: AbortController): boolean {
    return identityRef.current === ownerVnId && mutationAbortRef.current === controller && !controller.signal.aborted;
  }

  function finishMutation(ownerVnId: string, controller: AbortController, kind: 'add' | 'edit' | 'remove') {
    if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller) return;
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    setBusy(null);
    if (kind === 'edit') setSavingEdit(false);
  }

  async function add() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const ownerVnId = vnId;
    const controller = beginMutation('add');
    if (!controller) return;
    try {
      const r = await fetch(`/api/collection/${ownerVnId}/game-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: trimmed,
          session_minutes: attachSession && liveSessionMinutes > 0 ? liveSessionMinutes : null,
        }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const entry = decodeGameLogEntryResponse(await r.json());
      if (!entry) throw new Error(t.common.error);
      if (!ownsMutation(ownerVnId, controller)) return;
      setEntries((cur) => [entry, ...cur]);
      setText('');
      setAttachSession(false);
      textareaRef.current?.focus();
      startTransition(() => router.refresh());
    } catch (e) {
      if (!ownsMutation(ownerVnId, controller)) return;
      toast.error((e as Error).message);
    } finally {
      finishMutation(ownerVnId, controller, 'add');
    }
  }

  function startEdit(entry: GameLogEntry) {
    if (mutationInFlightRef.current) return;
    setEditingId(entry.id);
    setEditingText(entry.note);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingText('');
  }

  async function saveEdit() {
    if (editingId == null) return;
    const trimmed = editingText.trim();
    if (!trimmed) return;
    const ownerVnId = vnId;
    const ownerEditingId = editingId;
    const controller = beginMutation('edit');
    if (!controller) return;
    try {
      const r = await fetch(`/api/collection/${ownerVnId}/game-log`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ownerEditingId, note: trimmed }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const entry = decodeGameLogEntryResponse(await r.json());
      if (!entry) throw new Error(t.common.error);
      if (!ownsMutation(ownerVnId, controller)) return;
      setEntries((cur) => cur.map((e) => (e.id === ownerEditingId ? entry : e)));
      cancelEdit();
      startTransition(() => router.refresh());
    } catch (e) {
      if (!ownsMutation(ownerVnId, controller)) return;
      toast.error((e as Error).message);
    } finally {
      finishMutation(ownerVnId, controller, 'edit');
    }
  }

  async function remove(id: number) {
    const ownerVnId = vnId;
    const controller = beginMutation('remove');
    if (!controller) return;
    const ok = await confirm({ message: t.gameLog.deleteConfirm, tone: 'danger' });
    if (!ok || !ownsMutation(ownerVnId, controller)) {
      finishMutation(ownerVnId, controller, 'remove');
      return;
    }
    try {
      const r = await fetch(`/api/collection/${ownerVnId}/game-log?entry=${id}`, {
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
      finishMutation(ownerVnId, controller, 'remove');
    }
  }

  const grouped = useMemo(() => groupByDay(entries, locale), [entries, locale]);

  return (
    <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
      <header className="mb-3 flex flex-wrap items-baseline gap-2">
        <h3 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
          <BookOpenText className="h-4 w-4 text-accent" aria-hidden /> {t.gameLog.label}
        </h3>
        <p className="text-[11px] text-muted">{t.gameLog.hint}</p>
        <span className="ml-auto text-[10px] text-muted opacity-70">{t.gameLog.keyboardHint}</span>
      </header>

      <div className="mb-4 rounded-lg border border-border bg-bg-elev/30 p-2">
        <textarea
          ref={textareaRef}
          value={text}
          maxLength={NOTE_MAX}
          rows={2}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={t.gameLog.placeholder}
          aria-label={t.gameLog.placeholder}
          disabled={busy !== null}
          className="input w-full resize-y bg-transparent text-sm"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {liveSessionMinutes > 0 ? (
            <button
              type="button"
              onClick={() => setAttachSession((v) => !v)}
              aria-pressed={attachSession}
              disabled={busy !== null}
              className={`chip min-h-[44px] px-3 py-1 text-xs uppercase tracking-wider ${attachSession ? 'chip-active' : ''}`}
              title={attachSession ? t.gameLog.attachedSessionNo : t.gameLog.attachedSession.replace('{n}', String(liveSessionMinutes))}
            >
              <Sparkles className="h-3 w-3" aria-hidden />
              {attachSession
                ? t.gameLog.attachedSessionNo
                : t.gameLog.attachedSession.replace('{n}', String(liveSessionMinutes))}
            </button>
          ) : null}
          <span className={`ml-auto text-[10px] ${remaining < 100 ? 'text-status-dropped' : 'text-muted'}`}>
            {counterLabel}
          </span>
          <button
            type="button"
            onClick={add}
            disabled={busy !== null || text.trim().length === 0}
            className="btn btn-primary"
          >
            {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            {busy === 'add' ? t.gameLog.saving : t.gameLog.add}
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-muted">{t.gameLog.empty}</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ day, items }) => (
            <div key={day}>
              <h4 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">
                {day}
              </h4>
              <ol className="space-y-2">
                {items.map((entry) => {
                  const isEditing = editingId === entry.id;
                  return (
                    <li
                      key={entry.id}
                      className="group rounded-lg border border-border bg-bg-elev/30 p-3"
                    >
                      <div className="mb-1 flex flex-wrap items-baseline gap-2 text-[10px] text-muted">
                        <span className="inline-flex items-center gap-1 rounded bg-bg-card px-1.5 py-0.5 uppercase tracking-wider text-accent">
                          <Clock className="h-3 w-3" aria-hidden />
                          {fmtTime(entry.logged_at, locale)}
                        </span>
                        <span className="opacity-70">/</span>
                        <span>{relative(entry.logged_at, now, t)}</span>
                        {entry.session_minutes != null && (
                          <span className="inline-flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 font-semibold text-accent">
                            <Sparkles className="h-3 w-3" aria-hidden />
                            {t.gameLog.atSession.replace('{n}', String(entry.session_minutes))}
                          </span>
                        )}
                        {!isEditing && (
                          <span className="ml-auto inline-flex gap-1 transition-opacity can-hover:md:opacity-0 can-hover:md:group-hover:opacity-100 md:focus-within:opacity-100">
                            <button
                              type="button"
                              onClick={() => startEdit(entry)}
                              disabled={busy !== null}
                            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1 text-muted hover:text-white"
                              aria-label={t.gameLog.edit}
                              title={t.gameLog.edit}
                            >
                              <Pencil className="h-3 w-3" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(entry.id)}
                              disabled={busy !== null}
                            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1 text-muted hover:text-status-dropped"
                              aria-label={t.gameLog.delete}
                              title={t.gameLog.delete}
                            >
                              <Trash2 className="h-3 w-3" aria-hidden />
                            </button>
                          </span>
                        )}
                      </div>
                      {isEditing ? (
                        <div>
                          <textarea
                            value={editingText}
                            maxLength={NOTE_MAX}
                            rows={3}
                            autoFocus
                            aria-label={t.gameLog.placeholder}
                            disabled={busy !== null}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                e.preventDefault();
                                saveEdit();
                              }
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            className="input w-full resize-y text-sm"
                          />
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="btn text-xs"
                              disabled={busy !== null}
                            >
                              <X className="h-3 w-3" aria-hidden /> {t.gameLog.cancel}
                            </button>
                            <button
                              type="button"
                              onClick={saveEdit}
                              disabled={busy !== null || editingText.trim().length === 0}
                              className="btn btn-primary text-xs"
                            >
                              {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />}
                              {t.gameLog.save}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm text-white/90">{entry.note}</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function fmtTime(ts: number, locale: string): string {
  return new Date(ts).toLocaleTimeString(BCP47[locale as Locale] ?? 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relative(ts: number, now: number | null, t: ReturnType<typeof useT>): string {
  if (now == null) return '';
  return timeAgo(ts, t, now);
}

function groupByDay(entries: GameLogEntry[], locale: string): { day: string; items: GameLogEntry[] }[] {
  const fmt = new Intl.DateTimeFormat(BCP47[locale as Locale] ?? 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const map = new Map<string, GameLogEntry[]>();
  const keyOf = (ts: number): string => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  for (const e of entries) {
    const k = keyOf(e.logged_at);
    const cur = map.get(k);
    if (cur) cur.push(e);
    else map.set(k, [e]);
  }
  return Array.from(map.entries()).map(([k, items]) => ({
    day: fmt.format(new Date(items[0].logged_at)),
    items,
  }));
}
