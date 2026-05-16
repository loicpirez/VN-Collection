'use client';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Check, GitBranch, Loader2, Pencil, Plus, StickyNote, Trash2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useConfirm } from './ConfirmDialog';
import type { RouteRow } from '@/lib/types';
import type { VndbCharacter } from '@/lib/vndb-types';

interface Props {
  vnId: string;
  inCollection: boolean;
}

const ROLE_PRIORITY: Record<string, number> = { main: 0, primary: 1, side: 2, appears: 3 };

export function RoutesSection({ vnId, inCollection }: Props) {
  const t = useT();
  const { confirm } = useConfirm();
  const router = useRouter();
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [notesOpen, setNotesOpen] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [characters, setCharacters] = useState<VndbCharacter[]>([]);
  const [, startTransition] = useTransition();

  const reload = useCallback(async (signal?: AbortSignal) => {
    if (!inCollection) return;
    try {
      const r = await fetch(`/api/collection/${vnId}/routes`, { signal });
      if (!r.ok) return;
      const d = (await r.json()) as { routes: RouteRow[] };
      if (signal?.aborted) return;
      setRoutes(d.routes);
    } catch (e) {
      if ((e as Error).name === 'AbortError' || signal?.aborted) return;
      // ignore
    }
  }, [vnId, inCollection]);

  useEffect(() => {
    const ctrl = new AbortController();
    reload(ctrl.signal);
    return () => ctrl.abort();
  }, [reload]);

  useEffect(() => {
    if (!inCollection) return;
    const ctrl = new AbortController();
    fetch(`/api/vn/${vnId}/characters`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { characters: VndbCharacter[] } | null) => {
        if (!ctrl.signal.aborted && d) setCharacters(d.characters);
      })
      .catch((e) => {
        if ((e as Error).name === 'AbortError') return;
        // ignore — autocomplete is optional
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

  if (!inCollection) return null;

  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    const name = draft.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/collection/${vnId}/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const d = (await r.json()) as { routes: RouteRow[] };
      setRoutes(d.routes);
      setDraft('');
      startTransition(() => router.refresh());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: number, fields: Partial<RouteRow>) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/route/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      await reload();
      startTransition(() => router.refresh());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    const ok = await confirm({ message: t.routes.removeConfirm, tone: 'danger' });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/route/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(t.common.error);
      await reload();
      startTransition(() => router.refresh());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function move(id: number, direction: -1 | 1) {
    const idx = routes.findIndex((r) => r.id === id);
    const target = idx + direction;
    if (idx === -1 || target < 0 || target >= routes.length) return;
    const next = [...routes];
    [next[idx], next[target]] = [next[target], next[idx]];
    setRoutes(next);
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/collection/${vnId}/routes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: next.map((x) => x.id) }),
      });
      if (!r.ok) throw new Error(t.common.error);
      await reload();
    } catch (err) {
      setError((err as Error).message);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  function startEdit(r: RouteRow) {
    setEditingId(r.id);
    setEditingName(r.name);
  }

  async function saveEdit() {
    if (editingId == null) return;
    const next = editingName.trim();
    if (!next) {
      setEditingId(null);
      return;
    }
    await patch(editingId, { name: next });
    setEditingId(null);
  }

  const completed = routes.filter((r) => r.completed).length;
  const total = routes.length;
  const pct = total > 0 ? (completed / total) * 100 : 0;

  return (
    <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
          <GitBranch className="h-4 w-4 text-accent" /> {t.routes.section}
          {total > 0 && (
            <span className="text-[11px] font-normal text-muted">
              · {completed}/{total} {t.routes.completedCount}
            </span>
          )}
        </h3>
        {total > 0 && (
          <div className="hidden h-1 w-32 overflow-hidden rounded-full bg-bg-elev sm:block">
            <div
              className="h-full bg-status-completed transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      {error && <p className="mb-3 text-xs text-status-dropped">{error}</p>}

      {routes.length === 0 && <p className="mb-3 text-xs text-muted">{t.routes.empty}</p>}

      {routes.length > 0 && (
        <ul className="mb-4 space-y-2">
          {routes.map((r, i) => (
            <li
              key={r.id}
              className={`group rounded-lg border transition-colors ${
                r.completed ? 'border-status-completed/50 bg-status-completed/5' : 'border-border bg-bg-elev/30'
              }`}
            >
              <div className="flex items-center gap-2 px-3 py-2">
              <button
                type="button"
                onClick={() => patch(r.id, { completed: !r.completed })}
                disabled={busy}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
                  r.completed
                    ? 'border-status-completed bg-status-completed text-bg'
                    : 'border-border hover:border-accent'
                }`}
                title={r.completed ? t.routes.markIncomplete : t.routes.markComplete}
              >
                {r.completed && <Check className="h-3 w-3" />}
              </button>

              {editingId === r.id ? (
                <input
                  className="input flex-1"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit();
                    else if (e.key === 'Escape') setEditingId(null);
                  }}
                  onBlur={saveEdit}
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startEdit(r)}
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
                  {r.completed_date}
                </span>
              )}

              <div className="flex items-center gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <button
                  type="button"
                  onClick={() => move(r.id, -1)}
                  disabled={busy || i === 0}
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white disabled:opacity-30"
                  aria-label={t.routes.moveUp}
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => move(r.id, 1)}
                  disabled={busy || i === routes.length - 1}
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white disabled:opacity-30"
                  aria-label={t.routes.moveDown}
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
                {editingId === r.id ? (
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-status-dropped"
                    aria-label={t.common.cancel}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(r)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white"
                    aria-label={t.common.edit}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (notesOpen === r.id) { setNotesOpen(null); return; }
                    setNotesOpen(r.id);
                    setNotesDraft(r.notes ?? '');
                  }}
                  className={`inline-flex h-6 w-6 items-center justify-center rounded ${
                    r.notes ? 'text-accent' : 'text-muted hover:text-white'
                  }`}
                  aria-label={t.routes.notesToggle}
                  title={r.notes ? t.routes.notesEdit : t.routes.notesAdd}
                >
                  <StickyNote className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  disabled={busy}
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-status-dropped"
                  aria-label={t.common.delete}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              </div>
              {notesOpen === r.id && (
                <div className="border-t border-border bg-bg-elev/20 px-3 py-2">
                  <textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder={t.routes.notesPlaceholder}
                    className="w-full rounded-md border border-border bg-bg-card/60 p-2 text-xs leading-relaxed text-white/85 focus:border-accent focus:outline-none"
                  />
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                    <span className="text-muted">{notesDraft.length} / 2000</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setNotesOpen(null)}
                        className="rounded-md border border-border px-2 py-0.5 text-muted hover:text-white"
                      >
                        {t.common.cancel}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await patch(r.id, { notes: notesDraft.trim() || null });
                          setNotesOpen(null);
                        }}
                        disabled={busy}
                        className="rounded-md bg-accent px-2 py-0.5 font-bold text-bg disabled:opacity-50"
                      >
                        {t.common.save}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {notesOpen !== r.id && r.notes && (
                <p className="border-t border-border bg-bg-elev/10 px-3 py-2 text-[11px] italic text-muted whitespace-pre-wrap">
                  {r.notes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex gap-2">
        <input
          className="input flex-1"
          placeholder={t.routes.addPlaceholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          list={`routes-${vnId}-suggest`}
          maxLength={200}
        />
        <datalist id={`routes-${vnId}-suggest`}>
          {suggestions.map((c) => (
            <option key={c.id} value={c.name} label={c.original && c.original !== c.name ? c.original : undefined} />
          ))}
        </datalist>
        <button type="submit" className="btn btn-primary" disabled={!draft.trim() || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t.routes.add}
        </button>
      </form>

      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted">
            {t.routes.suggestionsLabel}
          </span>
          {suggestions.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setDraft(c.name);
              }}
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
