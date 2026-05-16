'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bookmark, BookmarkPlus, ChevronDown, Filter as FilterIcon, Loader2, Pin, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

interface Filter {
  id: number;
  name: string;
  params: string;
  position: number;
  created_at: number;
}

/**
 * Saved filter combos surfaced as a popover behind a single toolbar button —
 * the inline chip row took up a full row at the top of the library, which
 * the user flagged as wasteful. Active filter (when the URL matches one of
 * the saved presets) shows in the button label so it's still discoverable.
 */
export function SavedFilters() {
  const t = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const [filters, setFilters] = useState<Filter[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!open) return;
    function outside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', outside);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('mousedown', outside);
      window.removeEventListener('keydown', escape);
    };
  }, [open]);

  async function load() {
    const r = await fetch('/api/saved-filters', { cache: 'no-store' });
    if (!r.ok) return;
    const data = (await r.json()) as { filters: Filter[] };
    setFilters(data.filters);
  }

  function currentParamsKey(): string {
    const ignored = new Set(['page']);
    const entries: [string, string][] = [];
    sp.forEach((v, k) => { if (!ignored.has(k)) entries.push([k, v]); });
    entries.sort(([a], [b]) => a.localeCompare(b));
    return new URLSearchParams(entries).toString();
  }

  async function save() {
    const name = draftName.trim();
    if (!name) return;
    const params = currentParamsKey();
    if (!params) {
      toast.error(t.savedFilters.emptyState);
      return;
    }
    setBusy('save');
    try {
      const r = await fetch('/api/saved-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, params }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.saved);
      setNameOpen(false);
      setDraftName('');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: number) {
    setBusy(`del-${id}`);
    try {
      await fetch(`/api/saved-filters?id=${id}`, { method: 'DELETE' });
      load();
    } finally {
      setBusy(null);
    }
  }

  const currentKey = currentParamsKey();
  const active = filters.find((f) => f.params === currentKey) ?? null;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={popoverId}
        className={`tap-target inline-flex items-center gap-1.5 rounded-md border bg-bg-elev/40 px-2 py-1 text-[11px] ${
          active ? 'border-accent text-accent' : 'border-border text-muted hover:border-accent hover:text-accent'
        }`}
        title={t.savedFilters.title}
      >
        <Bookmark className="h-3 w-3" aria-hidden />
        {active ? active.name : t.savedFilters.title}
        {filters.length > 0 && !active && <span className="text-[10px] opacity-70">· {filters.length}</span>}
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>
      {open && (
        <div
          id={popoverId}
          role="menu"
          aria-label={t.savedFilters.title}
          className="absolute left-0 top-full z-30 mt-1 w-[min(92vw,18rem)] rounded-lg border border-border bg-bg-card p-2 text-xs shadow-card"
        >
          {filters.length === 0 ? (
            <div className="space-y-2 px-1 py-1">
              <p className="text-muted">{t.savedFilters.popoverEmpty}</p>
              {!currentKey && (
                <>
                  <p className="text-[10px] text-muted/70">
                    {t.savedFilters.openDrawerHint}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      // Ask the toolbar to open the Advanced filters
                      // drawer. The drawer listens for this event so
                      // the user lands directly on the filter UI
                      // instead of seeing this empty-popover dead end.
                      window.dispatchEvent(
                        new CustomEvent('vn:open-advanced-filters'),
                      );
                    }}
                    className="flex w-full items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2 py-1.5 text-accent hover:bg-accent/20"
                  >
                    <FilterIcon className="h-3 w-3" />
                    {t.savedFilters.openDrawerCta}
                  </button>
                </>
              )}
            </div>
          ) : (
            <ul className="mb-2 space-y-0.5">
              {filters.map((f) => {
                const isActive = f.params === currentKey;
                return (
                  <li key={f.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        router.push(`/?${f.params}`);
                        setOpen(false);
                      }}
                      className={`flex flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-bg-elev ${
                        isActive ? 'text-accent' : 'text-white/85'
                      }`}
                      title={f.params}
                    >
                      <Pin className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="truncate">{f.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(f.id)}
                      disabled={busy === `del-${f.id}`}
                      aria-label={t.common.delete}
                      className="tap-target-tight rounded text-muted hover:text-status-dropped"
                    >
                      {busy === `del-${f.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!nameOpen ? (
            <button
              type="button"
              onClick={() => { setDraftName(''); setNameOpen(true); }}
              disabled={!currentKey}
              className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-muted hover:border-accent hover:text-accent disabled:opacity-40"
              title={currentKey ? t.savedFilters.saveCurrent : t.savedFilters.emptyState}
            >
              <BookmarkPlus className="h-3 w-3" />
              {t.savedFilters.saveCta}
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setNameOpen(false); }}
                placeholder={t.savedFilters.namePlaceholder}
                aria-label={t.savedFilters.namePlaceholder}
                className="input w-full py-1 text-xs"
                maxLength={60}
              />
              <button type="button" onClick={save} disabled={busy === 'save'} className="btn btn-primary px-2 py-1 text-xs">
                {busy === 'save' ? <Loader2 className="h-3 w-3 animate-spin" /> : t.common.save}
              </button>
              <button type="button" onClick={() => setNameOpen(false)} className="rounded text-muted hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
