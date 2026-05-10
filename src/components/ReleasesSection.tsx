'use client';
import { useEffect, useState } from 'react';
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe,
  Languages,
  Mic2,
  Package,
  Shield,
} from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import type { VndbRelease } from '@/lib/vndb-types';

const VOICED_KEY: Record<number, 'voiced1' | 'voiced2' | 'voiced3' | 'voiced4'> = {
  1: 'voiced1',
  2: 'voiced2',
  3: 'voiced3',
  4: 'voiced4',
};

function fmtRes(r: VndbRelease['resolution']): string | null {
  if (r == null) return null;
  if (typeof r === 'string') return r;
  return `${r[0]}×${r[1]}`;
}

export function ReleasesSection({ vnId }: { vnId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [releases, setReleases] = useState<VndbRelease[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || releases !== null) return;
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/vn/${vnId}/releases`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
        return r.json();
      })
      .then((d: { releases: VndbRelease[] }) => alive && setReleases(d.releases))
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, vnId, releases, t.common.error]);

  return (
    <details
      className="group rounded-xl border border-border bg-bg-card"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-6 py-4 hover:bg-bg-elev/50">
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
          <Boxes className="h-4 w-4 text-accent" /> {t.releases.section}
          {releases && <span className="text-[11px] font-normal text-muted">· {releases.length}</span>}
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
      </summary>
      <div className="border-t border-border px-6 py-5">
        {loading && <p className="text-sm text-muted">{t.common.loading}</p>}
        {error && <p className="text-sm text-status-dropped">{error}</p>}
        {releases && releases.length === 0 && <p className="text-sm text-muted">{t.releases.empty}</p>}
        {releases && releases.length > 0 && (
          <ul className="space-y-3">
            {releases.map((r) => {
              const langs = r.languages.map((l) => l.lang).join(', ');
              const platforms = r.platforms.join(', ');
              const flags: string[] = [];
              if (r.official) flags.push(t.releases.official);
              if (r.patch) flags.push(t.releases.patch);
              if (r.freeware) flags.push(t.releases.freeware);
              if (r.uncensored) flags.push(t.releases.uncensored);
              if (r.has_ero) flags.push(t.releases.hasEro);
              const voicedKey = r.voiced && VOICED_KEY[r.voiced] ? VOICED_KEY[r.voiced] : null;
              const rtype = r.vns.find((v) => v.id === vnId)?.rtype;
              const dev = r.producers.filter((p) => p.developer).map((p) => p.name).join(', ');
              const pub = r.producers.filter((p) => p.publisher).map((p) => p.name).join(', ');
              const res = fmtRes(r.resolution);
              return (
                <li key={r.id} className="rounded-lg border border-border bg-bg-elev/50 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="text-sm font-bold">
                      <a
                        href={`https://vndb.org/${r.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-accent"
                      >
                        {r.title}
                      </a>
                      {rtype && (
                        <span className="ml-2 rounded-md bg-bg px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-accent">
                          {t.releases.rtype[rtype]}
                        </span>
                      )}
                    </h4>
                    {r.released && <span className="text-xs text-muted tabular-nums">{r.released}</span>}
                  </div>
                  {r.alttitle && r.alttitle !== r.title && (
                    <div className="mt-0.5 text-xs text-muted">{r.alttitle}</div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                    {langs && (
                      <span className="inline-flex items-center gap-1">
                        <Languages className="h-3 w-3" /> {langs}
                      </span>
                    )}
                    {platforms && (
                      <span className="inline-flex items-center gap-1">
                        <Globe className="h-3 w-3" /> {platforms}
                      </span>
                    )}
                    {res && <span>{t.releases.resolution}: {res}</span>}
                    {r.engine && <span>{t.releases.engine}: {r.engine}</span>}
                    {voicedKey && (
                      <span className="inline-flex items-center gap-1">
                        <Mic2 className="h-3 w-3" /> {t.releases[voicedKey]}
                      </span>
                    )}
                    {r.minage != null && (
                      <span className="inline-flex items-center gap-1">
                        <Shield className="h-3 w-3" /> {t.releases.ageRating} {r.minage}+
                      </span>
                    )}
                    {r.media.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Package className="h-3 w-3" /> {r.media.map((m) => `${m.medium}${m.qty > 1 ? `×${m.qty}` : ''}`).join(', ')}
                      </span>
                    )}
                  </div>
                  {(dev || pub) && (
                    <div className="mt-2 text-[11px] text-muted">
                      {dev && <span><b className="text-white/80">{dev}</b></span>}
                      {dev && pub && <span> · </span>}
                      {pub && <span>{pub}</span>}
                    </div>
                  )}
                  {flags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {flags.map((f) => (
                        <span key={f} className="rounded bg-bg px-1.5 py-0.5 text-[10px] text-accent">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                  {(r.gtin || r.catalog) && (
                    <div className="mt-2 text-[11px] text-muted">
                      {r.gtin && <span>{t.releases.gtin}: <span className="font-mono">{r.gtin}</span></span>}
                      {r.gtin && r.catalog && <span> · </span>}
                      {r.catalog && <span>{t.releases.catalog}: <span className="font-mono">{r.catalog}</span></span>}
                    </div>
                  )}
                  {r.extlinks.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {r.extlinks.slice(0, 6).map((l) => (
                        <a
                          key={l.url}
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent"
                        >
                          <ExternalLink className="h-3 w-3" /> {l.label}
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}
