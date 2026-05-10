'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Search, SlidersHorizontal } from 'lucide-react';
import { VnCard } from './VnCard';
import { useT } from '@/lib/i18n/client';
import type { VndbSearchHit } from '@/lib/types';

const COMMON_LANGS = ['en', 'ja', 'zh-Hans', 'zh-Hant', 'ko', 'fr', 'de', 'es', 'it', 'ru'];
const COMMON_PLATFORMS = ['win', 'lin', 'mac', 'ios', 'and', 'web', 'swi', 'ps4', 'ps5', 'psv', 'psp', 'xb1', 'xbs', 'n3d'];

const LENGTH_LABELS = ['Very short', 'Short', 'Medium', 'Long', 'Very long'];

interface AdvParams {
  langs: string[];
  platforms: string[];
  lengthMin: number | null;
  lengthMax: number | null;
  yearMin: string;
  yearMax: string;
  ratingMin: string;
  hasScreenshot: boolean;
  hasReview: boolean;
  hasAnime: boolean;
}

const DEFAULT_ADV: AdvParams = {
  langs: [],
  platforms: [],
  lengthMin: null,
  lengthMax: null,
  yearMin: '',
  yearMax: '',
  ratingMin: '',
  hasScreenshot: false,
  hasReview: false,
  hasAnime: false,
};

export function SearchClient() {
  const t = useT();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<VndbSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  const [adv, setAdv] = useState<AdvParams>(DEFAULT_ADV);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const advActive =
    adv.langs.length > 0 ||
    adv.platforms.length > 0 ||
    adv.lengthMin !== null ||
    adv.lengthMax !== null ||
    !!adv.yearMin ||
    !!adv.yearMax ||
    !!adv.ratingMin ||
    adv.hasScreenshot ||
    adv.hasReview ||
    adv.hasAnime;

  // Quick search
  useEffect(() => {
    if (advActive) return; // advanced is driven by an explicit submit
    if (!q.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    setTouched(true);
    setLoading(true);
    setError(null);
    const ctrl = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || t.search.errorPrefix);
        }
        const data = await r.json();
        setResults(data.results);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setError((e as Error).message);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(handle);
    };
  }, [q, advActive, t.search.errorPrefix]);

  async function runAdvanced() {
    setTouched(true);
    setLoading(true);
    setError(null);
    try {
      const body = {
        q: q.trim() || undefined,
        langs: adv.langs.length ? adv.langs : undefined,
        platforms: adv.platforms.length ? adv.platforms : undefined,
        lengthMin: adv.lengthMin ?? undefined,
        lengthMax: adv.lengthMax ?? undefined,
        yearMin: adv.yearMin ? Number(adv.yearMin) : undefined,
        yearMax: adv.yearMax ? Number(adv.yearMax) : undefined,
        ratingMin: adv.ratingMin ? Number(adv.ratingMin) : undefined,
        hasScreenshot: adv.hasScreenshot || undefined,
        hasReview: adv.hasReview || undefined,
        hasAnime: adv.hasAnime || undefined,
      };
      const r = await fetch('/api/search/advanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.search.errorPrefix);
      const data = await r.json();
      setResults(data.results);
    } catch (e) {
      setError((e as Error).message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function toggle(arr: string[], value: string): string[] {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  return (
    <div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          ref={inputRef}
          className="input pl-9"
          placeholder={t.search.placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && advActive) runAdvanced();
          }}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`btn ${advOpen || advActive ? 'btn-primary' : ''}`}
          onClick={() => setAdvOpen((v) => !v)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {t.search.advanced}
          {advActive && <span className="rounded-full bg-bg/30 px-1.5 text-[10px]">●</span>}
          {advOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {advActive && (
          <button type="button" className="btn" onClick={() => setAdv(DEFAULT_ADV)}>
            {t.search.resetAdvanced}
          </button>
        )}
        {advActive && (
          <button type="button" className="btn btn-primary" onClick={runAdvanced}>
            {t.search.runAdvanced}
          </button>
        )}
      </div>

      {advOpen && (
        <div className="mb-6 rounded-xl border border-border bg-bg-card p-4 text-xs">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">{t.search.langsField}</h4>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_LANGS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={`chip ${adv.langs.includes(l) ? 'chip-active' : ''}`}
                    onClick={() => setAdv((s) => ({ ...s, langs: toggle(s.langs, l) }))}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">{t.search.platformsField}</h4>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`chip ${adv.platforms.includes(p) ? 'chip-active' : ''}`}
                    onClick={() => setAdv((s) => ({ ...s, platforms: toggle(s.platforms, p) }))}
                  >
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">{t.search.lengthField}</h4>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = adv.lengthMin !== null && adv.lengthMax !== null && n >= adv.lengthMin && n <= adv.lengthMax;
                  return (
                    <button
                      key={n}
                      type="button"
                      className={`chip ${active ? 'chip-active' : ''}`}
                      onClick={() => {
                        // Click selects single value (min == max)
                        setAdv((s) => ({ ...s, lengthMin: n, lengthMax: n }));
                      }}
                    >
                      {n} · {LENGTH_LABELS[n - 1]}
                    </button>
                  );
                })}
                {(adv.lengthMin !== null || adv.lengthMax !== null) && (
                  <button
                    type="button"
                    className="chip"
                    onClick={() => setAdv((s) => ({ ...s, lengthMin: null, lengthMax: null }))}
                  >
                    {t.common.cancel}
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{t.search.yearMin}</span>
                <input
                  type="number"
                  className="input"
                  placeholder="1990"
                  min={1970}
                  max={2099}
                  value={adv.yearMin}
                  onChange={(e) => setAdv((s) => ({ ...s, yearMin: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{t.search.yearMax}</span>
                <input
                  type="number"
                  className="input"
                  placeholder="2026"
                  min={1970}
                  max={2099}
                  value={adv.yearMax}
                  onChange={(e) => setAdv((s) => ({ ...s, yearMax: e.target.value }))}
                />
              </label>
            </div>
            <div>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{t.search.ratingMin}</span>
                <input
                  type="number"
                  className="input"
                  placeholder="70"
                  min={10}
                  max={100}
                  value={adv.ratingMin}
                  onChange={(e) => setAdv((s) => ({ ...s, ratingMin: e.target.value }))}
                />
              </label>
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={adv.hasScreenshot}
                  onChange={(e) => setAdv((s) => ({ ...s, hasScreenshot: e.target.checked }))}
                />
                {t.search.hasScreenshot}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={adv.hasReview}
                  onChange={(e) => setAdv((s) => ({ ...s, hasReview: e.target.checked }))}
                />
                {t.search.hasReview}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={adv.hasAnime}
                  onChange={(e) => setAdv((s) => ({ ...s, hasAnime: e.target.checked }))}
                />
                {t.search.hasAnime}
              </label>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-status-dropped bg-status-dropped/10 p-4 text-sm text-status-dropped">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-muted">{t.search.searching}</div>
      ) : !touched && !results.length ? (
        <div className="py-20 text-center">
          <h2 className="mb-2 text-xl font-bold">{t.search.heroTitle}</h2>
          <p className="text-muted">{t.search.heroSubtitle}</p>
        </div>
      ) : results.length === 0 ? (
        <div className="py-20 text-center text-muted">{t.search.noResults}</div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {results.map((r) => (
            <VnCard
              key={r.id}
              data={{
                id: r.id,
                title: r.title,
                poster: r.image?.thumbnail || r.image?.url || null,
                released: r.released,
                rating: r.rating,
                length_minutes: r.length_minutes,
                inCollectionBadge: r.in_collection,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
