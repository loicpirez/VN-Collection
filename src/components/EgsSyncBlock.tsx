'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, Clock, Loader2, RefreshCw, Save, Sparkles, Star } from 'lucide-react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/client';
import { formatMinutes } from '@/lib/format';
import { useToast } from './ToastProvider';

interface Suggestion {
  vn_id: string;
  vn_title: string;
  egs_id: number;
  egs_gamename: string;
  local_minutes: number;
  egs_minutes: number | null;
  local_rating: number | null;
  egs_score: number | null;
  egs_finish_date: string | null;
  egs_start_date: string | null;
}

function fmtMin(n: number | null): string {
  return formatMinutes(n, { fallback: '—', emptyValue: 'allow_zero' });
}

/**
 * EGS playtime + score sync. Symmetric to the Steam suggestions section:
 *   - "Username" input → POST /api/settings { egs_username }
 *   - "Compute" pulls userreview rows from EGS and shows what would
 *     change locally for VNs we have an egs_game.vn_id link for.
 *   - "Apply" pushes the selected rows into the local collection
 *     (playtime / rating / start_date / finish_date).
 */
export function EgsSyncBlock() {
  const t = useT();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [usernameDirty, setUsernameDirty] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const [computing, setComputing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [needsConfig, setNeedsConfig] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const r = await fetch('/api/settings', { cache: 'no-store' });
      if (!r.ok) return;
      const d = (await r.json()) as { egs_username?: string };
      setUsername(d.egs_username ?? '');
      setUsernameDirty(false);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  async function saveUsername() {
    setSavingUsername(true);
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ egs_username: username.trim() || null }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.saved);
      setUsernameDirty(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingUsername(false);
    }
  }

  async function compute() {
    setComputing(true);
    try {
      const r = await fetch('/api/egs/sync', { cache: 'no-store' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const d = (await r.json()) as { needsConfig?: boolean; suggestions: Suggestion[] };
      setNeedsConfig(!!d.needsConfig);
      setSuggestions(d.suggestions);
      setPicks(new Set(d.suggestions.map((s) => s.vn_id)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setComputing(false);
    }
  }

  async function apply() {
    if (picks.size === 0) return;
    setApplying(true);
    try {
      const r = await fetch('/api/egs/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vn_ids: Array.from(picks) }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const d = (await r.json()) as { applied: number };
      toast.success(`${t.egsSync.appliedSummary} (${d.applied})`);
      setSuggestions([]);
      setPicks(new Set());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  function togglePick(vnId: string) {
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(vnId)) next.delete(vnId);
      else next.add(vnId);
      return next;
    });
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          type="text"
          className="input"
          value={username}
          placeholder={t.egsSync.usernamePlaceholder}
          onChange={(e) => {
            setUsername(e.target.value);
            setUsernameDirty(true);
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={savingUsername || !usernameDirty}
          onClick={saveUsername}
        >
          {savingUsername ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t.common.save}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn"
          onClick={compute}
          disabled={computing || !username.trim()}
        >
          {computing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t.egsSync.compute}
        </button>
        {suggestions.length > 0 && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={apply}
            disabled={applying || picks.size === 0}
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {t.egsSync.applySelected.replace('{count}', String(picks.size))}
          </button>
        )}
      </div>
      {needsConfig && (
        <p className="rounded-md border border-status-on_hold/40 bg-status-on_hold/10 p-3 text-xs">
          {t.egsSync.needsConfig}
        </p>
      )}
      {suggestions.length > 0 && (
        <ul className="space-y-1.5">
          {suggestions.map((s) => {
            const picked = picks.has(s.vn_id);
            return (
              <li
                key={s.vn_id}
                onClick={() => togglePick(s.vn_id)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-bg-elev/30 p-2 text-xs transition-colors ${
                  picked ? 'border-accent ring-1 ring-accent/30' : 'border-border hover:border-accent/50'
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                    picked ? 'border-accent bg-accent text-bg' : 'border-border'
                  }`}
                >
                  {picked && <Check className="h-3 w-3" />}
                </span>
                <Sparkles className="h-3 w-3 shrink-0 text-accent" aria-hidden />
                <Link
                  href={`/vn/${s.vn_id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="min-w-0 flex-1 truncate font-bold hover:text-accent"
                >
                  {s.vn_title}
                </Link>
                <span className="text-[10px] text-muted">
                  {s.egs_minutes != null && s.egs_minutes > s.local_minutes && (
                    <span className="mr-2 inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" aria-hidden /> {fmtMin(s.local_minutes)}
                      <ArrowRight className="h-3 w-3" aria-hidden /> {fmtMin(s.egs_minutes)}
                    </span>
                  )}
                  {s.egs_score != null && s.egs_score > 0 && s.local_rating == null && (
                    <span className="mr-2 inline-flex items-center gap-1">
                      <Star className="h-3 w-3 fill-accent" aria-hidden /> {s.egs_score}
                    </span>
                  )}
                  {s.egs_finish_date && (
                    <span className="mr-2 inline-flex items-center gap-1">
                      <Check className="h-3 w-3" aria-hidden /> {s.egs_finish_date}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
