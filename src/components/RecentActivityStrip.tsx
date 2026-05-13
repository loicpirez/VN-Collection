import Link from 'next/link';
import { Activity, Clock } from 'lucide-react';
import { listRecentActivity, type RecentActivityEntry } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import type { Status } from '@/lib/types';

function formatRelative(ts: number, t: Dictionary): string {
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return t.recentActivity.justNow;
  if (diff < 60 * 60 * 1000) return t.recentActivity.minutesAgo.replace('{n}', String(Math.floor(diff / 60000)));
  if (diff < 24 * 60 * 60 * 1000) return t.recentActivity.hoursAgo.replace('{n}', String(Math.floor(diff / 3600000)));
  if (diff < 7 * 24 * 60 * 60 * 1000) return t.recentActivity.daysAgo.replace('{n}', String(Math.floor(diff / 86400000)));
  return new Date(ts).toISOString().slice(0, 10);
}

function describe(entry: RecentActivityEntry, t: Dictionary): string {
  switch (entry.kind) {
    case 'status': {
      const next = (entry.payload?.next as Status | null) ?? null;
      const label = next ? t.status[next] : t.recentActivity.cleared;
      return t.recentActivity.statusChange.replace('{status}', label);
    }
    case 'rating': {
      const v = entry.payload?.next as number | null | undefined;
      return v != null
        ? t.recentActivity.ratingChange.replace('{rating}', String(v))
        : t.recentActivity.ratingCleared;
    }
    case 'playtime': {
      const delta = entry.payload?.delta_minutes as number | undefined;
      if (typeof delta === 'number' && delta !== 0) {
        const sign = delta > 0 ? '+' : '';
        return t.recentActivity.playtimeDelta.replace('{delta}', `${sign}${delta}m`);
      }
      const next = entry.payload?.next as number | undefined;
      return next != null ? t.recentActivity.playtimeSet.replace('{n}', `${next}m`) : t.recentActivity.playtimeSet.replace('{n}', '—');
    }
    case 'favorite':
      return entry.payload?.next ? t.recentActivity.favorited : t.recentActivity.unfavorited;
    case 'started':
      return t.recentActivity.startedReading;
    case 'finished':
      return t.recentActivity.finishedReading;
    case 'note':
      return t.recentActivity.noteUpdated;
    case 'manual':
      return (entry.payload?.text as string) ?? t.recentActivity.manual;
    default:
      return entry.kind;
  }
}

/**
 * Cross-VN activity feed shown on the home page. Pulls the 10 most recent
 * rows from `vn_activity` so the user can see "what have I been doing" at
 * a glance without having to open each VN. Hidden entirely when no activity
 * is recorded yet.
 */
export async function RecentActivityStrip() {
  const t = await getDict();
  const entries = listRecentActivity(10);
  if (entries.length === 0) return null;

  return (
    <section className="mb-6 rounded-xl border border-border bg-bg-card p-4">
      <h2 className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
        <Activity className="h-4 w-4 text-accent" /> {t.recentActivity.title}
      </h2>
      <ul className="space-y-1.5 text-xs">
        {entries.map((e) => (
          <li key={e.id} className="flex items-baseline gap-2">
            <Clock className="h-3 w-3 shrink-0 text-muted" aria-hidden />
            <Link href={`/vn/${e.vn_id}`} className="truncate font-bold hover:text-accent">
              {e.title}
            </Link>
            <span className="text-muted">— {describe(e, t)}</span>
            <span className="ml-auto shrink-0 text-[10px] text-muted">{formatRelative(e.occurred_at, t)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
