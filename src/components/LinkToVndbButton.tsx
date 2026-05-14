'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Link2, Loader2, Search, X } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';

interface SearchHit {
  id: string;
  title: string;
  released: string | null;
  developers?: { id: string; name: string }[];
}

/**
 * Shown on /vn/egs_NNN pages. Lets the user search VNDB by title and
 * link the synthetic EGS-only entry to a real VNDB id. On confirm the
 * server migrates every reference (collection / editions / quotes /
 * routes / EGS link / credits / activity) to the new id and drops the
 * synthetic vn row.
 *
 * Symmetric to the existing EGS picker on VNDB-only VNs — the other
 * half of "link both directions".
 */
export function LinkToVndbButton({ vnId, seedQuery }: { vnId: string; seedQuery: string }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(seedQuery);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { cache: 'no-store' });
      if (!r.ok) return;
      const d = (await r.json()) as { results?: SearchHit[] };
      setHits((d.results ?? []).slice(0, 30));
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query, search]);

  useEffect(() => {
    if (open && hits.length === 0) {
      search(query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function link(targetId: string) {
    if (!confirm(t.linkVndb.confirm.replace('{id}', targetId))) return;
    setLinkingId(targetId);
    try {
      const r = await fetch(`/api/vn/${vnId}/link-vndb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vndb_id: targetId }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.linkVndb.done);
      // The synthetic vn row is gone — navigate to the real one.
      router.replace(`/vn/${targetId}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLinkingId(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn"
        title={t.linkVndb.title}
      >
        <Link2 className="h-4 w-4" /> {t.linkVndb.cta}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur" onClick={() => setOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[min(92vw,640px)] max-h-[80vh] overflow-y-auto rounded-2xl border border-border bg-bg-card p-5 shadow-card"
          >
            <header className="mb-3 flex items-baseline justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">{t.linkVndb.title}</h2>
                <p className="text-[11px] text-muted">{t.linkVndb.hint}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t.common.close} className="text-muted hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.linkVndb.searchPlaceholder}
                className="input w-full pl-7 text-xs"
              />
              {searching && <Loader2 className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-muted" />}
            </div>
            <ul className="space-y-1">
              {hits.length === 0 && !searching && (
                <li className="p-3 text-xs text-muted">{t.linkVndb.empty}</li>
              )}
              {hits.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-bg-elev/30 px-3 py-2 text-xs hover:border-accent"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{h.title}</div>
                    <div className="flex flex-wrap gap-x-2 text-[10px] text-muted">
                      <span className="font-mono">{h.id}</span>
                      {h.released && <span>{h.released}</span>}
                      {h.developers?.slice(0, 2).map((d) => (
                        <span key={d.id}>{d.name}</span>
                      ))}
                    </div>
                  </div>
                  <a
                    href={`https://vndb.org/${h.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded p-1 text-muted hover:text-accent"
                    title={t.linkVndb.openVndb}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <button
                    type="button"
                    onClick={() => link(h.id)}
                    disabled={linkingId !== null}
                    className="btn btn-primary"
                  >
                    {linkingId === h.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                    {t.linkVndb.useThis}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
