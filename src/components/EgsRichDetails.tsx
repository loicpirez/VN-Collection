'use client';
import { useEffect, useState } from 'react';
import { ExternalLink, Film, Gamepad2, ShoppingBag, Sparkles, Twitter, Users } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { formatMinutes } from '@/lib/format';

interface RawRow {
  [key: string]: string | null;
}

interface EgsExtra {
  game: { id: number; gamename: string; raw?: RawRow } | null;
}

function n(v: string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function fmtMin(m: number | null): string | null {
  const v = formatMinutes(m, { emptyValue: 'strict_positive' });
  return v === '' ? null : v;
}

/**
 * Surfaces the EGS columns the main EgsPanel doesn't already display:
 * trailer, demo, store links (DMM / DLsite / Gyutto), genre, score range
 * (max2 / min2 / median2), POV "before / after / regardless" distribution,
 * sales rank, time-to-understanding-the-fun, brand twitter.
 *
 * Reads the raw row from /api/vn/[id]/erogamescape and renders only the
 * fields that are non-empty. Stays hidden entirely when there's no EGS match.
 */
export function EgsRichDetails({ vnId }: { vnId: string }) {
  const t = useT();
  const [raw, setRaw] = useState<RawRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`/api/vn/${vnId}/erogamescape`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: EgsExtra | null) => {
        if (alive) setRaw(d?.game?.raw ?? null);
      })
      .catch(() => {
        // panel just hides on error
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [vnId]);

  if (loading || !raw) return null;

  const trailer = n(raw.erogetrailers);
  const trailerUrl = trailer && trailer > 0 ? `https://erogetrailers.com/movie/${trailer}` : null;
  const trial = raw.trial_url && raw.trial_url.startsWith('http') ? raw.trial_url : null;
  const dmm = raw.dmm && raw.dmm !== '' ? `https://dlsoft.dmm.co.jp/detail/${raw.dmm}/` : null;
  const dlsite =
    raw.dlsite_id && raw.dlsite_id !== '' && raw.dlsite_domain
      ? `https://www.dlsite.com/${raw.dlsite_domain}/work/=/product_id/${raw.dlsite_id}.html`
      : null;
  const gyutto = raw.gyutto_id ? `https://gyutto.com/i/item${raw.gyutto_id}` : null;
  const twitter = raw.twitter ? `https://twitter.com/${raw.twitter.replace(/^@/, '')}` : null;
  const genre = raw.genre && raw.genre !== '' ? raw.genre : null;
  const softHard = n(raw.axis_of_soft_or_hard);
  const max2 = n(raw.max2);
  const min2 = n(raw.min2);
  const median2 = n(raw.median2);
  const sales = n(raw.hanbaisuu);
  // EGS stores all playtime fields in HOURS — convert to minutes so the
  // fmtMin helper (which assumes minutes) renders e.g. "2h" instead of "2m".
  const funHours = n(raw.time_before_understanding_fun_median);
  const fun = funHours != null ? Math.round(funHours * 60) : null;
  const povA = n(raw.total_pov_enrollment_of_a);
  const povB = n(raw.total_pov_enrollment_of_b);
  const povC = n(raw.total_pov_enrollment_of_c);
  const tourokubi = raw.tourokubi || null;

  const links: { href: string; label: string; icon: React.ReactNode }[] = [];
  if (trailerUrl) links.push({ href: trailerUrl, label: 'EroGameTrailers', icon: <Film className="h-3 w-3" /> });
  if (trial) links.push({ href: trial, label: t.egsRich.demo, icon: <Gamepad2 className="h-3 w-3" /> });
  if (dmm) links.push({ href: dmm, label: 'DMM', icon: <ShoppingBag className="h-3 w-3" /> });
  if (dlsite) links.push({ href: dlsite, label: 'DLsite', icon: <ShoppingBag className="h-3 w-3" /> });
  if (gyutto) links.push({ href: gyutto, label: 'Gyutto', icon: <ShoppingBag className="h-3 w-3" /> });
  if (twitter) links.push({ href: twitter, label: 'Twitter', icon: <Twitter className="h-3 w-3" /> });

  const hasScoreRange = max2 != null || min2 != null || median2 != null;
  const hasPov = povA != null || povB != null || povC != null;
  const totalPov = (povA ?? 0) + (povB ?? 0) + (povC ?? 0);

  const hasAny =
    links.length > 0 ||
    genre ||
    softHard != null ||
    hasScoreRange ||
    hasPov ||
    sales != null ||
    fun != null ||
    tourokubi;
  if (!hasAny) return null;

  return (
    <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-5">
      <h3 className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
        <Sparkles className="h-4 w-4 text-accent" /> {t.egsRich.title}
      </h3>

      {links.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
            >
              {l.icon}
              {l.label}
              <ExternalLink className="h-2.5 w-2.5 opacity-60" aria-hidden />
            </a>
          ))}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[11px] sm:grid-cols-3">
        {genre && (
          <Stat label={t.egsRich.genre} value={genre} />
        )}
        {softHard != null && (
          <Stat
            label={t.egsRich.softHard}
            value={`${softHard.toFixed(1)} / 5`}
            hint={t.egsRich.softHardHint}
          />
        )}
        {hasScoreRange && (
          <Stat
            label={t.egsRich.scoreRange}
            value={`${min2 ?? '?'} – ${max2 ?? '?'}${median2 != null ? ` · ~${median2}` : ''}`}
          />
        )}
        {fun != null && fun > 0 && (
          <Stat
            label={t.egsRich.timeToFun}
            value={fmtMin(fun) ?? '—'}
            hint={t.egsRich.timeToFunHint}
          />
        )}
        {sales != null && sales > 0 && (
          <Stat label={t.egsRich.salesRank} value={sales.toLocaleString()} />
        )}
        {tourokubi && (
          <Stat label={t.egsRich.registered} value={tourokubi} />
        )}
      </dl>

      {hasPov && totalPov > 0 && (
        <div className="mt-4 rounded-lg border border-border bg-bg-elev/40 p-3 text-[11px]">
          <div className="mb-1 inline-flex items-center gap-1 font-bold uppercase tracking-wider text-muted">
            <Users className="h-3 w-3" /> {t.egsRich.povBreakdown}
          </div>
          <p className="mb-2 text-muted/80">{t.egsRich.povBreakdownHint}</p>
          <div className="grid grid-cols-3 gap-2">
            <PovBar tone="good" label="A" value={povA ?? 0} total={totalPov} />
            <PovBar tone="warn" label="B" value={povB ?? 0} total={totalPov} />
            <PovBar tone="dropped" label="C" value={povC ?? 0} total={totalPov} />
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="font-bold tabular-nums">{value}</dd>
      {hint && <p className="text-[10px] text-muted/70">{hint}</p>}
    </div>
  );
}

function PovBar({
  tone,
  label,
  value,
  total,
}: {
  tone: 'good' | 'warn' | 'dropped';
  label: string;
  value: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const fill = tone === 'good' ? 'bg-status-completed' : tone === 'warn' ? 'bg-status-playing' : 'bg-status-dropped';
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
        <span className="tabular-nums">{value} <span className="text-muted">({pct}%)</span></span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
        <div className={`h-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
