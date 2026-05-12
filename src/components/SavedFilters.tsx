'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookmarkPlus, Loader2, Pin, X } from 'lucide-react';
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
 * Compact chip list of saved filter combos. Each chip applies its stored URL
 * params; an "active" chip is highlighted when the current URL matches.
 * The "+" chip pins the current query as a new preset.
 *
 * Filters are read once on mount and refreshed after every mutation. No
 * polling — the user is the only writer.
 */
export function SavedFilters() {
  const t = useT();
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const [filters, setFilters] = useState<Filter[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [nameOpen, setNameOpen] = useState(false);
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    load();
  }, []);

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

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {filters.map((f) => {
        const active = f.params === currentKey;
        return (
          <span key={f.id} className="inline-flex items-center">
            <button
              type="button"
              onClick={() => router.push(`/?${f.params}`)}
              className={`chip inline-flex items-center gap-1 whitespace-nowrap ${active ? 'chip-active' : ''}`}
              title={f.params}
            >
              <Pin className="h-3 w-3" />
              {f.name}
            </button>
            <button
              type="button"
              onClick={() => remove(f.id)}
              disabled={busy === `del-${f.id}`}
              className="ml-0.5 rounded text-muted hover:text-status-dropped"
              aria-label={t.common.delete}
            >
              {busy === `del-${f.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
            </button>
          </span>
        );
      })}
      {!nameOpen ? (
        <button
          type="button"
          onClick={() => { setDraftName(''); setNameOpen(true); }}
          disabled={!currentKey}
          className="chip inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-40"
          title={currentKey ? t.savedFilters.saveCurrent : t.savedFilters.emptyState}
        >
          <BookmarkPlus className="h-3 w-3" />
          {t.savedFilters.saveCta}
        </button>
      ) : (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setNameOpen(false); }}
            placeholder={t.savedFilters.namePlaceholder}
            className="input w-44 py-0.5 text-xs"
            maxLength={60}
          />
          <button type="button" onClick={save} disabled={busy === 'save'} className="btn btn-primary px-2 py-0.5 text-xs">
            {busy === 'save' ? <Loader2 className="h-3 w-3 animate-spin" /> : t.common.save}
          </button>
          <button type="button" onClick={() => setNameOpen(false)} className="rounded text-muted hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
    </div>
  );
}
