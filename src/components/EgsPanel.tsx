'use client';
import { useEffect, useState } from 'react';
import { Clock, ExternalLink, Sparkles, Star, Users } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface EgsGame {
  id: number;
  gamename: string;
  median: number | null;
  average: number | null;
  dispersion: number | null;
  count: number | null;
  sellday: string | null;
  playtime_median_minutes: number | null;
  url: string;
}

interface Props {
  vnId: string;
  /** VNDB rating on the 0-100 scale (i.e. how VNDB returns it). */
  vndbRating: number | null;
  vndbVoteCount: number | null;
  vndbLengthMinutes: number | null;
  /** User-recorded playtime in minutes. */
  myPlaytimeMinutes: number;
}

function fmtMinutes(m: number | null | undefined): string | null {
  if (!m || m <= 0) return null;
  const h = Math.floor(m / 60);
  const mn = m % 60;
  if (h && mn) return `${h}h ${mn}m`;
  if (h) return `${h}h`;
  return `${mn}m`;
}

/**
 * EGS rating is on a 1-100 scale where ~75-80 is "great". VNDB uses 10-100 too
 * but with a different distribution; we display both as-is and a combined score
 * (mean of the two normalised to 100) when both are present.
 */
function combinedScore(vndb: number | null, egs: number | null): number | null {
  const a = vndb != null ? vndb : null;
  const b = egs != null ? egs : null;
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return Math.round((a + b) / 2);
}

export function EgsPanel({
  vnId,
  vndbRating,
  vndbVoteCount,
  vndbLengthMinutes,
  myPlaytimeMinutes,
}: Props) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<EgsGame | null>(null);
  const [source, setSource] = useState<'extlink' | 'search' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/vn/${vnId}/erogamescape`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
        return r.json();
      })
      .then((d: { game: EgsGame | null; source: 'extlink' | 'search' | null }) => {
        if (!alive) return;
        setGame(d.game);
        setSource(d.source);
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [vnId, t.common.error]);

  if (loading) {
    return null; // silent until we know
  }
  if (error || !game) return null;

  const combined = combinedScore(vndbRating, game.median);
  const totalPlaytime = (myPlaytimeMinutes || 0) + (game.playtime_median_minutes ?? 0);
  const myPt = fmtMinutes(myPlaytimeMinutes || null);
  const egsPt = fmtMinutes(game.playtime_median_minutes);
  const vndbPt = fmtMinutes(vndbLengthMinutes);
  const sumPt = fmtMinutes(totalPlaytime || null);

  return (
    <section className="rounded-xl border border-border bg-bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
          <Sparkles className="h-4 w-4 text-accent" /> {t.egs.section}
          {source === 'search' && (
            <span className="rounded bg-bg-elev/60 px-1.5 py-0.5 text-[10px] font-normal text-muted">
              {t.egs.fuzzyMatch}
            </span>
          )}
        </h3>
        <a
          href={game.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent"
        >
          <ExternalLink className="h-3 w-3" /> {t.egs.openOnEgs}
        </a>
      </div>

      <div className="mb-3 line-clamp-2 text-sm font-semibold">{game.gamename}</div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          icon={<Star className="h-3 w-3" />}
          label={t.egs.median}
          value={game.median != null ? `${game.median} / 100` : '—'}
          tone="accent"
        />
        <Stat
          icon={<Star className="h-3 w-3" />}
          label={t.egs.average}
          value={game.average != null ? game.average.toFixed(1) : '—'}
        />
        <Stat
          icon={<Users className="h-3 w-3" />}
          label={t.egs.voteCount}
          value={game.count != null ? game.count.toLocaleString() : '—'}
        />
        <Stat
          icon={<Clock className="h-3 w-3" />}
          label={t.egs.playtimeMedian}
          value={egsPt ?? '—'}
        />
      </div>

      {(vndbRating != null || combined != null) && (
        <div className="mt-4 grid gap-3 rounded-lg border border-border bg-bg-elev/40 p-3 sm:grid-cols-3">
          <Stat
            label={t.egs.vndbRating}
            value={
              vndbRating != null
                ? `${(vndbRating / 10).toFixed(1)} / 10`
                : '—'
            }
            hint={
              vndbVoteCount != null
                ? `${vndbVoteCount.toLocaleString()} ${t.egs.votes}`
                : undefined
            }
          />
          <Stat
            label={t.egs.egsRating}
            value={game.median != null ? `${game.median} / 100` : '—'}
            hint={
              game.count != null
                ? `${game.count.toLocaleString()} ${t.egs.votes}`
                : undefined
            }
          />
          {combined != null && (
            <Stat
              label={t.egs.combined}
              value={`${combined} / 100`}
              tone="accent"
              hint={t.egs.combinedHint}
            />
          )}
        </div>
      )}

      {(myPt || egsPt || vndbPt || sumPt) && (
        <div className="mt-4">
          <div className="mb-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted">
            <Clock className="h-3 w-3" /> {t.egs.playtimeTitle}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
            {vndbPt && <span><b className="text-white">{vndbPt}</b> <span className="text-muted">{t.egs.playtimeVndb}</span></span>}
            {egsPt && <span><b className="text-white">{egsPt}</b> <span className="text-muted">{t.egs.playtimeEgs}</span></span>}
            {myPt && <span><b className="text-white">{myPt}</b> <span className="text-muted">{t.egs.playtimeMine}</span></span>}
            {sumPt && (myPlaytimeMinutes > 0 || (game.playtime_median_minutes ?? 0) > 0) && (
              <span className="rounded-md bg-accent/15 px-2 py-0.5 text-accent">
                {t.egs.playtimeSum}: <b>{sumPt}</b>
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: 'accent';
}) {
  return (
    <div>
      <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted">
        {icon}
        {label}
      </div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${tone === 'accent' ? 'text-accent' : ''}`}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-muted/80">{hint}</div>}
    </div>
  );
}
