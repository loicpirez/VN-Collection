'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Search, Tag as TagIcon, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface TagSummary {
  id: string;
  name: string;
  category: 'cont' | 'ero' | 'tech';
  vn_count: number;
}

/**
 * Shared tag picker used by /recommendations and /similar.
 *
 * - Renders the current tag list as chips with a remove (X) button.
 * - Below the chips: a search input that calls `/api/tags?q=`, with
 *   debounced autocomplete results that can be added in one click.
 * - Calls `onChange` whenever the picked set changes; the caller is
 *   responsible for syncing that to URL state.
 *
 * The component never owns the picked list; the parent always passes
 * it in. That makes it trivially reusable for either page's URL state.
 */
export function TagPicker({
  tags,
  onChange,
  /** Optional VNDB category filter for the autocomplete (cont / ero / tech). */
  category,
  /** When set, render this label above the input. */
  label,
  /** Hint shown below the picker chips. */
  hint,
}: {
  tags: TagSummary[];
  onChange: (next: TagSummary[]) => void;
  category?: 'cont' | 'ero' | 'tech';
  label?: string;
  hint?: string;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<TagSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) {
        setHits([]);
        return;
      }
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: trimmed, results: '20' });
        if (category) params.set('category', category);
        const r = await fetch(`/api/tags?${params.toString()}`, { cache: 'no-store' });
        if (!r.ok) return;
        const d = (await r.json()) as { tags?: TagSummary[] };
        setHits(d.tags ?? []);
      } finally {
        setSearching(false);
      }
    },
    [category],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  const pickedIds = new Set(tags.map((t) => t.id));

  function add(tag: TagSummary) {
    if (pickedIds.has(tag.id)) return;
    onChange([...tags, tag]);
    setQuery('');
    setHits([]);
  }

  function remove(id: string) {
    onChange(tags.filter((t) => t.id !== id));
  }

  function clearAll() {
    onChange([]);
    setQuery('');
    setHits([]);
  }

  return (
    <div className="rounded-lg border border-border bg-bg-elev/40 p-3">
      {label && (
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          <TagIcon className="h-3 w-3" aria-hidden />
          {label}
        </div>
      )}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {tags.length === 0 && (
          <span className="text-[11px] italic text-muted">{t.tagPicker.empty}</span>
        )}
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] text-accent"
          >
            <span className="font-mono opacity-60">{tag.id}</span>
            <span>{tag.name}</span>
            <button
              type="button"
              onClick={() => remove(tag.id)}
              aria-label={t.tagPicker.remove.replace('{name}', tag.name)}
              className="rounded-full p-0.5 hover:bg-accent/20"
            >
              <X className="h-2.5 w-2.5" aria-hidden />
            </button>
          </span>
        ))}
        {tags.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-card px-2 py-0.5 text-[11px] text-muted hover:border-status-dropped hover:text-status-dropped"
            title={t.tagPicker.clearAll}
          >
            <X className="h-2.5 w-2.5" aria-hidden />
            {t.tagPicker.clearAll}
          </button>
        )}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.tagPicker.searchPlaceholder}
          aria-label={t.tagPicker.searchPlaceholder}
          className="input w-full pl-7 text-xs"
        />
        {searching && (
          <Loader2 className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-muted" />
        )}
      </div>
      {hits.length > 0 && (
        <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto rounded-md border border-border bg-bg-card p-1">
          {hits.map((hit) => {
            const already = pickedIds.has(hit.id);
            return (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => add(hit)}
                  disabled={already}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] ${
                    already ? 'text-muted opacity-50' : 'hover:bg-bg-elev hover:text-accent'
                  }`}
                >
                  <Plus className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="font-mono text-[10px] opacity-60">{hit.id}</span>
                  <span className="flex-1 truncate">{hit.name}</span>
                  <span className="rounded bg-bg-elev px-1 py-0 text-[10px] uppercase tracking-wider text-muted">
                    {hit.category}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted">
                    {hit.vn_count.toLocaleString()}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {hint && (
        <p className="mt-2 text-[10px] text-muted">{hint}</p>
      )}
    </div>
  );
}
