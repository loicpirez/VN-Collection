'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import { SafeImage } from './SafeImage';
import { SkeletonBlock } from './Skeleton';
import { useT } from '@/lib/i18n/client';
import type { VndbCharacter } from '@/lib/vndb-types';

const ROLE_ORDER: Record<string, number> = { main: 0, primary: 1, side: 2, appears: 3 };

function ageString(ch: VndbCharacter, t: ReturnType<typeof useT>): string[] {
  const out: string[] = [];
  if (ch.age != null) out.push(`${ch.age} ${t.characters.years}`);
  if (ch.height) out.push(`${ch.height} cm`);
  if (ch.weight) out.push(`${ch.weight} kg`);
  if (ch.blood_type) out.push(ch.blood_type.toUpperCase());
  return out;
}

export function CharactersSection({
  vnId,
  initialOpen = false,
}: {
  vnId: string;
  /**
   * Initial open/closed state. The VN-detail layout host passes
   * `!collapsedByDefault` so the user's "collapsed by default"
   * preference actually flips the section's first paint. Falls
   * back to closed so the heavy character fetch stays lazy when
   * the prop is omitted.
   */
  initialOpen?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(initialOpen);
  const [chars, setChars] = useState<VndbCharacter[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || chars !== null) return;
    // AbortController instead of an `alive` flag — cancels the
    // pending fetch when the user navigates away mid-load instead of
    // letting the response complete and accumulate ghost state on
    // unmounted components (the "opening many VN pages crashes"
    // pattern).
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/vn/${vnId}/characters`, { signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
        return r.json();
      })
      .then((d: { characters: VndbCharacter[] }) => {
        if (!ac.signal.aborted) setChars(d.characters);
      })
      .catch((e: Error) => {
        if (e.name === 'AbortError' || ac.signal.aborted) return;
        setError(e.message);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [open, vnId, chars, t.common.error]);

  const sorted = chars
    ? [...chars]
        .map((c) => ({ ...c, _vn: c.vns.find((v) => v.id === vnId) }))
        .sort((a, b) => (ROLE_ORDER[a._vn?.role ?? 'appears'] ?? 9) - (ROLE_ORDER[b._vn?.role ?? 'appears'] ?? 9))
    : [];

  return (
    <details
      className="group rounded-xl border border-border bg-bg-card"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-6 py-4 hover:bg-bg-elev/50">
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
          <Users className="h-4 w-4 text-accent" /> {t.characters.section}
          {chars && <span className="text-[11px] font-normal text-muted">· {chars.length}</span>}
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
      </summary>
      <div className="border-t border-border px-6 py-5">
        {loading && <CharactersSkeleton />}
        {error && <p className="text-sm text-status-dropped">{error}</p>}
        {!loading && chars && chars.length === 0 && <p className="text-sm text-muted">{t.characters.empty}</p>}
        {sorted.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((c) => {
              const role = c._vn?.role ?? 'appears';
              const roleLabel = t.characters.roles[role as keyof typeof t.characters.roles] ?? role;
              const meta = ageString(c, t);
              return (
                // Nested <Link> elements are invalid HTML (anchors
                // can't contain anchors). Outer wrapper is now a
                // styled <div> with a single linked title and the
                // image is its own Link; trait chips below stay as
                // their own Links without being nested inside the
                // character link.
                <div
                  key={c.id}
                  className="flex gap-3 rounded-lg border border-border bg-bg-elev/50 p-3 transition-colors hover:border-accent"
                >
                  <Link
                    href={`/character/${c.id}`}
                    className="shrink-0"
                    aria-label={c.name}
                  >
                    <SafeImage
                      src={c.image?.url ?? null}
                      localSrc={c.localImage ?? null}
                      sexual={c.image?.sexual ?? null}
                      alt={c.name}
                      className="h-28 w-20 rounded-md"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link
                        href={`/character/${c.id}`}
                        className="truncate text-sm font-bold hover:text-accent"
                      >
                        <h4 className="truncate">{c.name}</h4>
                      </Link>
                      <span className="rounded-md bg-bg px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                        {roleLabel}
                      </span>
                    </div>
                    {c.original && c.original !== c.name && (
                      <div className="truncate text-xs text-muted">{c.original}</div>
                    )}
                    {meta.length > 0 && (
                      <div className="mt-1 text-[11px] text-muted">{meta.join(' · ')}</div>
                    )}
                    {c.traits.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {c.traits
                          .filter((tr) => tr.spoiler === 0 && !tr.sexual)
                          .slice(0, 5)
                          .map((tr) => (
                            <Link
                              key={tr.id}
                              href={`/trait/${encodeURIComponent(tr.id)}`}
                              className="rounded bg-bg px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:bg-accent hover:text-bg"
                            >
                              {tr.name}
                            </Link>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}

function CharactersSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-lg border border-border bg-bg-elev/50 p-3">
          <SkeletonBlock className="h-20 w-14 shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <SkeletonBlock className="h-3 w-2/3" />
            <SkeletonBlock className="h-2.5 w-1/3" />
            <SkeletonBlock className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
