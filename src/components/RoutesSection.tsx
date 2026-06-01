'use client';
import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, StickyNote, Trash2, X } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { formatIsoDateString } from '@/lib/locale-number';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastProvider';
import { ErrorAlert } from './ErrorAlert';
import { SkeletonRows } from './Skeleton';
import type { RouteRow } from '@/lib/types';
import type { VndbCharacter } from '@/lib/vndb-types';
import { fetchVnCharacters } from '@/lib/vn-characters-cache';

import { readApiError } from '@/lib/api-error-read';
interface Props {
  vnId: string;
  inCollection: boolean;
}

const ROLE_PRIORITY: Record<string, number> = { main: 0, primary: 1, side: 2, appears: 3 };

interface RouteRowProps {
  r: RouteRow;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  togglePending: boolean;
  removePending: boolean;
  moveUpPending: boolean;
  moveDownPending: boolean;
  notesPending: boolean;
  editing: boolean;
  editingName: string;
  notesOpen: boolean;
  notesDraft: string;
  locale: ReturnType<typeof useLocale>;
  t: ReturnType<typeof useT>;
  onToggleComplete: (r: RouteRow) => void;
  onStartEdit: (r: RouteRow) => void;
  onEditNameChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onMoveUp: (id: number) => void;
  onMoveDown: (id: number) => void;
  onToggleNotes: (r: RouteRow) => void;
  onNotesDraftChange: (value: string) => void;
  onCancelNotes: () => void;
  onSaveNotes: (r: RouteRow) => void;
  onRemove: (id: number) => void;
}

/**
 * Single route entry. Memoized with a primitive prop signature and
 * stable parent callbacks so editing, reordering, or busy toggles only
 * re-render the affected rows instead of the whole list.
 */
const RouteRowItem = memo(function RouteRowItem({
  r,
  isFirst,
  isLast,
  busy,
  togglePending,
  removePending,
  moveUpPending,
  moveDownPending,
  notesPending,
  editing,
  editingName,
  notesOpen,
  notesDraft,
  locale,
  t,
  onToggleComplete,
  onStartEdit,
  onEditNameChange,
  onSaveEdit,
  onCancelEdit,
  onMoveUp,
  onMoveDown,
  onToggleNotes,
  onNotesDraftChange,
  onCancelNotes,
  onSaveNotes,
  onRemove,
}: RouteRowProps) {
  return (
    <li
      className={`group rounded-lg border transition-colors ${
        r.completed ? 'border-status-completed/50 bg-status-completed/5' : 'border-border bg-bg-elev/30'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
      <button
        type="button"
        onClick={() => onToggleComplete(r)}
        disabled={busy}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
          r.completed
            ? 'border-status-completed bg-status-completed text-bg'
            : 'border-border hover:border-accent'
        }`}
        title={r.completed ? t.routes.markIncomplete : t.routes.markComplete}
      >
        {togglePending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : r.completed && <Check className="h-3 w-3" />}
      </button>

      {editing ? (
        <input
          className="input flex-1"
          value={editingName}
          aria-label={t.routes.addPlaceholder}
          onChange={(e) => onEditNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveEdit();
            else if (e.key === 'Escape') onCancelEdit();
          }}
          onBlur={onSaveEdit}
          autoFocus
        />
      ) : (
        <button
          type="button"
          onClick={() => onStartEdit(r)}
          className={`flex-1 truncate text-left text-sm transition-colors ${
            r.completed ? 'line-through decoration-status-completed/60 text-muted' : 'text-white hover:text-accent'
          }`}
          title={r.name}
        >
          {r.name}
        </button>
      )}

      {r.completed_date && (
        <span className="text-[10px] text-muted tabular-nums">
          {formatIsoDateString(r.completed_date, locale)}
        </span>
      )}

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onMoveUp(r.id)}
          disabled={busy || isFirst}
          className="tap-target inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white disabled:opacity-30"
          aria-label={t.routes.moveUp}
        >
          {moveUpPending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <ArrowUp className="h-3 w-3" />}
        </button>
        <button
          type="button"
          onClick={() => onMoveDown(r.id)}
          disabled={busy || isLast}
          className="tap-target inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white disabled:opacity-30"
          aria-label={t.routes.moveDown}
        >
          {moveDownPending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <ArrowDown className="h-3 w-3" />}
        </button>
        {editing ? (
          <button
            type="button"
            onClick={onCancelEdit}
            className="tap-target inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-status-dropped"
            aria-label={t.common.cancel}
          >
            <X className="h-3 w-3" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onStartEdit(r)}
            className="tap-target inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white"
            aria-label={t.common.edit}
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onToggleNotes(r)}
          className={`tap-target inline-flex h-6 w-6 items-center justify-center rounded ${
            r.notes ? 'text-accent' : 'text-muted hover:text-white'
          }`}
          aria-label={t.routes.notesToggle}
          title={r.notes ? t.routes.notesEdit : t.routes.notesAdd}
        >
          <StickyNote className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onRemove(r.id)}
          disabled={busy}
          className="tap-target inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-status-dropped"
          aria-label={t.common.delete}
        >
          {removePending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Trash2 className="h-3 w-3" />}
        </button>
      </div>
      </div>
      {notesOpen && (
        <div className="border-t border-border bg-bg-elev/20 px-3 py-2">
          <textarea
            value={notesDraft}
            onChange={(e) => onNotesDraftChange(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={t.routes.notesPlaceholder}
            aria-label={t.routes.notesPlaceholder}
            className="w-full rounded-md border border-border bg-bg-card/60 p-2 text-xs leading-relaxed text-white/85 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg"
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[10px]">
            <span className="text-muted">{notesDraft.length} / 2000</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={onCancelNotes}
                className="rounded-md border border-border px-2 py-0.5 text-muted hover:text-white"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={() => onSaveNotes(r)}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 font-bold text-bg disabled:opacity-50"
              >
                {notesPending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                {t.common.save}
              </button>
            </div>
          </div>
        </div>
      )}
      {!notesOpen && r.notes && (
        <p className="border-t border-border bg-bg-elev/10 px-3 py-2 text-[11px] italic text-muted whitespace-pre-wrap">
          {r.notes}
        </p>
      )}
    </li>
  );
});

interface RouteAddFormProps {
  vnId: string;
  busy: boolean;
  hasError: boolean;
  prefill: string;
  prefillNonce: number;
  suggestions: (VndbCharacter & { role: string })[];
  t: ReturnType<typeof useT>;
  onAdd: (name: string) => Promise<boolean>;
  onClearError: () => void;
}

/**
 * Add-route input + submit button. Owns its own `draft` state so a
 * keystroke re-renders only this form, not the whole section (which
 * holds the route list). The parent prefills the field from a
 * suggestion chip via the `prefill` / `prefillNonce` pair, and clears
 * its own draft on a successful add.
 */
const RouteAddForm = memo(function RouteAddForm({
  vnId,
  busy,
  hasError,
  prefill,
  prefillNonce,
  suggestions,
  t,
  onAdd,
  onClearError,
}: RouteAddFormProps) {
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (prefill) setDraft(prefill);
  }, [prefill, prefillNonce]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const name = draft.trim();
    if (!name) return;
    if (await onAdd(name)) setDraft('');
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        className="input flex-1"
        placeholder={t.routes.addPlaceholder}
        aria-label={t.routes.addPlaceholder}
        value={draft}
        onChange={(e) => {
          if (hasError) onClearError();
          setDraft(e.target.value);
        }}
        list={`routes-${vnId}-suggest`}
        maxLength={200}
      />
      <datalist id={`routes-${vnId}-suggest`}>
        {suggestions.map((c) => (
          <option key={c.id} value={c.name} label={c.original && c.original !== c.name ? c.original : undefined} />
        ))}
      </datalist>
      <button type="submit" className="btn btn-primary" disabled={!draft.trim() || busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" />}
        {t.routes.add}
      </button>
    </form>
  );
});

export function RoutesSection({ vnId, inCollection }: Props) {
  const t = useT();
  const locale = useLocale();
  const { confirm } = useConfirm();
  const toast = useToast();
  const router = useRouter();
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [prefill, setPrefill] = useState('');
  const [prefillNonce, setPrefillNonce] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [notesOpen, setNotesOpen] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ id: number; kind: 'toggle' | 'remove' | 'moveUp' | 'moveDown' | 'notes' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [characters, setCharacters] = useState<VndbCharacter[]>([]);
  const [, startTransition] = useTransition();
  const routesRef = useRef<RouteRow[]>(routes);
  routesRef.current = routes;
  const editingNameRef = useRef(editingName);
  editingNameRef.current = editingName;
  const editingIdRef = useRef(editingId);
  editingIdRef.current = editingId;
  const notesDraftRef = useRef(notesDraft);
  notesDraftRef.current = notesDraft;
  const notesOpenRef = useRef(notesOpen);
  notesOpenRef.current = notesOpen;

  const reload = useCallback(async (signal?: AbortSignal) => {
    if (!inCollection) return;
    try {
      const r = await fetch(`/api/collection/${vnId}/routes`, { signal, cache: 'no-store' });
      if (!r.ok) throw new Error(await readApiError(r, t.routes.loadError));
      const d = (await r.json()) as { routes: RouteRow[] };
      if (signal?.aborted) return;
      setRoutes(d.routes);
      setLoadError(false);
    } catch (e) {
      if ((e as Error).name === 'AbortError' || signal?.aborted) return;
      setLoadError(true);
    }
  }, [vnId, inCollection, t.routes.loadError]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    reload(ctrl.signal).finally(() => {
      if (!ctrl.signal.aborted) setLoading(false);
    });
    return () => ctrl.abort();
  }, [reload]);

  useEffect(() => {
    if (!inCollection) return;
    const ctrl = new AbortController();
    fetchVnCharacters(vnId, ctrl.signal)
      .then((data) => {
        if (!ctrl.signal.aborted) setCharacters(data);
      })
      .catch((e) => {
        if ((e as Error).name === 'AbortError') return;
        console.error('[RoutesSection] characters fetch failed:', e);
      });
    return () => ctrl.abort();
  }, [vnId, inCollection]);

  const usedNames = useMemo(
    () => new Set(routes.map((r) => r.name.trim().toLowerCase())),
    [routes],
  );

  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const pickRole = (c: VndbCharacter): string => {
      const v = c.vns.find((vv) => vv.id === vnId);
      return v?.role ?? 'appears';
    };
    return [...characters]
      .map((c) => ({ ...c, role: pickRole(c) }))
      .filter((c) => c.role === 'main' || c.role === 'primary')
      .sort((a, b) => (ROLE_PRIORITY[a.role] ?? 9) - (ROLE_PRIORITY[b.role] ?? 9))
      .filter((c) => {
        const k = c.name.trim().toLowerCase();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return !usedNames.has(k);
      });
  }, [characters, usedNames, vnId]);

  const add = useCallback(async (name: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/collection/${vnId}/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const d = (await r.json()) as { routes: RouteRow[] };
      setRoutes(d.routes);
      startTransition(() => router.refresh());
      toast.success(t.routes.added);
      return true;
    } catch (err) {
      setError((err as Error).message);
      toast.error((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }, [vnId, router, toast, t.common.error, t.routes.added]);

  const clearError = useCallback(() => setError(null), []);

  const prefillDraft = useCallback((name: string) => {
    setPrefill(name);
    setPrefillNonce((n) => n + 1);
  }, []);

  const patch = useCallback(async (id: number, fields: Partial<RouteRow>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/route/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      await reload();
      startTransition(() => router.refresh());
      toast.success(t.routes.updated);
    } catch (err) {
      setError((err as Error).message);
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }, [reload, router, toast, t.common.error, t.routes.updated]);

  const remove = useCallback(async (id: number) => {
    const ok = await confirm({ message: t.routes.removeConfirm, tone: 'danger' });
    if (!ok) return;
    setBusy(true);
    setPendingAction({ id, kind: 'remove' });
    setError(null);
    try {
      const r = await fetch(`/api/route/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      await reload();
      startTransition(() => router.refresh());
      toast.success(t.routes.removed);
    } catch (err) {
      setError((err as Error).message);
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }, [confirm, reload, router, toast, t.common.error, t.routes.removed, t.routes.removeConfirm]);

  const move = useCallback(async (id: number, direction: -1 | 1) => {
    const current = routesRef.current;
    const idx = current.findIndex((r) => r.id === id);
    const target = idx + direction;
    if (idx === -1 || target < 0 || target >= current.length) return;
    const next = [...current];
    [next[idx], next[target]] = [next[target], next[idx]];
    setRoutes(next);
    setBusy(true);
    setPendingAction({ id, kind: direction === -1 ? 'moveUp' : 'moveDown' });
    setError(null);
    try {
      const r = await fetch(`/api/collection/${vnId}/routes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: next.map((x) => x.id) }),
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      await reload();
      toast.success(t.routes.reordered);
    } catch (err) {
      setError((err as Error).message);
      toast.error((err as Error).message);
      await reload();
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  }, [reload, vnId, toast, t.common.error, t.routes.reordered]);

  const startEdit = useCallback((r: RouteRow) => {
    setEditingId(r.id);
    setEditingName(r.name);
  }, []);

  const saveEdit = useCallback(async () => {
    const id = editingIdRef.current;
    if (id == null) return;
    const next = editingNameRef.current.trim();
    if (!next) {
      setEditingId(null);
      return;
    }
    await patch(id, { name: next });
    setEditingId(null);
  }, [patch]);

  const cancelEdit = useCallback(() => setEditingId(null), []);

  const editNameChange = useCallback((value: string) => {
    setError(null);
    setEditingName(value);
  }, []);

  const toggleComplete = useCallback(
    (r: RouteRow) => {
      setPendingAction({ id: r.id, kind: 'toggle' });
      return patch(r.id, { completed: !r.completed });
    },
    [patch],
  );

  const toggleNotes = useCallback((r: RouteRow) => {
    if (notesOpenRef.current === r.id) {
      setNotesOpen(null);
      return;
    }
    setNotesOpen(r.id);
    setNotesDraft(r.notes ?? '');
  }, []);

  const cancelNotes = useCallback(() => setNotesOpen(null), []);

  const saveNotes = useCallback(async (r: RouteRow) => {
    setPendingAction({ id: r.id, kind: 'notes' });
    await patch(r.id, { notes: notesDraftRef.current.trim() || null });
    setNotesOpen(null);
  }, [patch]);

  const moveUp = useCallback((id: number) => move(id, -1), [move]);
  const moveDown = useCallback((id: number) => move(id, 1), [move]);

  if (!inCollection) return null;

  const completed = routes.filter((r) => r.completed).length;
  const total = routes.length;
  const pct = total > 0 ? (completed / total) * 100 : 0;

  return (
    <section className="p-4 sm:p-6">
      {total > 0 && (
        <div className="mb-4 flex items-center justify-end gap-3">
          <span className="text-[11px] font-normal text-muted">
            {completed}/{total} {t.routes.completedCount}
          </span>
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t.routes.completedCount}
            className="hidden h-1 w-32 overflow-hidden rounded-full bg-bg-elev sm:block"
          >
            <div
              className="h-full bg-status-completed transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mb-3">
          <ErrorAlert title={t.common.error}>{error}</ErrorAlert>
        </div>
      )}

      {loading && routes.length === 0 ? (
        <div className="mb-4">
          <SkeletonRows count={3} withThumb={false} label={t.common.loading} />
        </div>
      ) : loadError ? (
        <div className="mb-3">
          <ErrorAlert title={t.common.error}>{t.routes.loadError}</ErrorAlert>
        </div>
      ) : (
        routes.length === 0 && <p className="mb-3 text-xs text-muted">{t.routes.empty}</p>
      )}

      {routes.length > 0 && (
        <ul className="mb-4 space-y-2">
          {routes.map((r, i) => (
            <RouteRowItem
              key={r.id}
              r={r}
              isFirst={i === 0}
              isLast={i === routes.length - 1}
              busy={busy}
              togglePending={pendingAction?.id === r.id && pendingAction.kind === 'toggle'}
              removePending={pendingAction?.id === r.id && pendingAction.kind === 'remove'}
              moveUpPending={pendingAction?.id === r.id && pendingAction.kind === 'moveUp'}
              moveDownPending={pendingAction?.id === r.id && pendingAction.kind === 'moveDown'}
              notesPending={pendingAction?.id === r.id && pendingAction.kind === 'notes'}
              editing={editingId === r.id}
              editingName={editingName}
              notesOpen={notesOpen === r.id}
              notesDraft={notesDraft}
              locale={locale}
              t={t}
              onToggleComplete={toggleComplete}
              onStartEdit={startEdit}
              onEditNameChange={editNameChange}
              onSaveEdit={saveEdit}
              onCancelEdit={cancelEdit}
              onMoveUp={moveUp}
              onMoveDown={moveDown}
              onToggleNotes={toggleNotes}
              onNotesDraftChange={setNotesDraft}
              onCancelNotes={cancelNotes}
              onSaveNotes={saveNotes}
              onRemove={remove}
            />
          ))}
        </ul>
      )}

      <RouteAddForm
        vnId={vnId}
        busy={busy}
        hasError={error !== null}
        prefill={prefill}
        prefillNonce={prefillNonce}
        suggestions={suggestions}
        t={t}
        onAdd={add}
        onClearError={clearError}
      />

      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted">
            {t.routes.suggestionsLabel}
          </span>
          {suggestions.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => prefillDraft(c.name)}
              className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
              title={c.original && c.original !== c.name ? `${c.name} · ${c.original}` : c.name}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
