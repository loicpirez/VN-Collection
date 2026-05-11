'use client';
import { useCallback, useEffect, useState } from 'react';
import { Heart, KeyRound, Loader2, RefreshCw, Search } from 'lucide-react';
import { VnCard } from './VnCard';
import { useT } from '@/lib/i18n/client';

interface WishlistItem {
  id: string;
  added: number;
  vote: number | null;
  notes: string | null;
  vn: {
    id: string;
    title: string;
    alttitle: string | null;
    released: string | null;
    rating: number | null;
    votecount: number | null;
    length_minutes: number | null;
    languages: string[];
    platforms: string[];
    image: { url: string; thumbnail: string; sexual?: number } | null;
    developers: { id: string; name: string }[];
  };
  in_collection: boolean;
}

export function WishlistClient() {
  const t = useT();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [hideOwned, setHideOwned] = useState(true);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const r = await fetch('/api/wishlist', { cache: 'no-store', signal });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
        const d = (await r.json()) as { needsAuth?: boolean; items: WishlistItem[] };
        if (signal?.aborted) return;
        if (d.needsAuth) {
          setNeedsAuth(true);
          setItems([]);
        } else {
          setNeedsAuth(false);
          setItems(d.items);
        }
        setError(null);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setError((e as Error).message);
      }
    },
    [t.common.error],
  );

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    load(ac.signal).finally(() => setLoading(false));
    return () => ac.abort();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const ownedCount = items.filter((it) => it.in_collection).length;
  const filtered = items.filter((it) => {
    if (hideOwned && it.in_collection) return false;
    const lower = q.trim().toLowerCase();
    if (!lower) return true;
    return (
      it.vn.title.toLowerCase().includes(lower) ||
      (it.vn.alttitle?.toLowerCase().includes(lower) ?? false) ||
      it.vn.developers.some((d) => d.name.toLowerCase().includes(lower))
    );
  });

  return (
    <div>
      <header className="mb-6 flex items-center gap-3">
        <Heart className="h-7 w-7 text-accent" aria-hidden />
        <div>
          <h1 className="text-2xl font-bold">{t.wishlist.pageTitle}</h1>
          <p className="text-sm text-muted">{t.wishlist.pageSubtitle}</p>
        </div>
      </header>

      {needsAuth ? (
        <div className="rounded-xl border border-border bg-bg-card p-6 text-sm text-muted">
          <KeyRound className="mb-2 h-5 w-5 text-accent" aria-hidden />
          <p className="mb-2">{t.wishlist.needsAuthTitle}</p>
          <p className="text-xs">
            {t.wishlist.needsAuthHint}{' '}
            <a
              href="https://vndb.org/u/tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              vndb.org/u/tokens
            </a>
          </p>
        </div>
      ) : loading ? (
        <div className="py-20 text-center text-muted">
          <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
          {t.common.loading}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-status-dropped bg-status-dropped/10 p-4 text-sm text-status-dropped">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-muted">{t.wishlist.empty}</div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                className="input pl-9"
                placeholder={t.wishlist.searchPlaceholder}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={hideOwned}
                onChange={(e) => setHideOwned(e.target.checked)}
              />
              {t.wishlist.hideOwned}
            </label>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/50 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
              title={t.wishlist.refresh}
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
              {t.wishlist.refresh}
            </button>
            <span className="ml-auto text-xs text-muted">
              {t.wishlist.ownedSummary
                .replace('{owned}', String(ownedCount))
                .replace('{todo}', String(items.length - ownedCount))}
              {' · '}
              {filtered.length} / {items.length}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filtered.map((it) => (
              <VnCard
                key={it.id}
                enableAdd
                onAdded={(id) =>
                  setItems((prev) =>
                    prev.map((x) => (x.vn.id === id ? { ...x, in_collection: true } : x)),
                  )
                }
                data={{
                  id: it.vn.id,
                  title: it.vn.title,
                  alttitle: it.vn.alttitle,
                  poster: it.vn.image?.thumbnail || it.vn.image?.url || null,
                  sexual: it.vn.image?.sexual ?? null,
                  released: it.vn.released,
                  rating: it.vn.rating,
                  length_minutes: it.vn.length_minutes,
                  developers: it.vn.developers,
                  inCollectionBadge: it.in_collection,
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
