'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Clock, Loader2, RefreshCw, Save, Sparkles, Star } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useT } from '@/lib/i18n/client';
import { formatMinutes } from '@/lib/format';
import { formatIsoDateString } from '@/lib/locale-number';
import { useToast } from './ToastProvider';

import { readApiError } from '@/lib/api-error-read';
import {
  decodeEgsSyncAppliedCount,
  decodeEgsSyncPreview,
  decodeEgsUsernameSetting,
  type EgsSyncClientSuggestion as Suggestion,
} from '@/lib/operation-client-shape';

const SUGGESTIONS_PREVIEW_LIMIT = 60;

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
  const locale = useLocale();
  const fmtMin = (n: number | null): string =>
    formatMinutes(n, locale, t.year, { fallback: '-', emptyValue: 'allow_zero' });
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [usernameDirty, setUsernameDirty] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const [computing, setComputing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [needsConfig, setNeedsConfig] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const mountedRef = useRef(true);
  const usernameRef = useRef('');
  const usernameDirtyRef = useRef(false);
  const usernameSaveRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const usernameAbortRef = useRef<AbortController | null>(null);
  const syncAbortRef = useRef<AbortController | null>(null);

  const loadConfig = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await fetch('/api/settings', { cache: 'no-store', signal });
      if (!r.ok) return;
      const username = decodeEgsUsernameSetting(await r.json());
      if (username === null || signal?.aborted || !mountedRef.current || usernameDirtyRef.current) return;
      usernameRef.current = username;
      setUsername(username);
      setUsernameDirty(false);
    } catch {
    } finally {
      if (!signal?.aborted && mountedRef.current) setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const ac = new AbortController();
    loadConfig(ac.signal);
    return () => {
      mountedRef.current = false;
      usernameSaveRef.current = false;
      syncInFlightRef.current = false;
      usernameAbortRef.current?.abort();
      syncAbortRef.current?.abort();
      ac.abort();
    };
  }, [loadConfig]);

  async function saveUsername() {
    if (usernameSaveRef.current) return;
    const ownerUsername = usernameRef.current.trim() || null;
    const controller = new AbortController();
    usernameAbortRef.current?.abort();
    usernameAbortRef.current = controller;
    usernameSaveRef.current = true;
    setSavingUsername(true);
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ egs_username: ownerUsername }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (!mountedRef.current || usernameAbortRef.current !== controller || controller.signal.aborted) return;
      toast.success(t.toast.saved);
      if ((usernameRef.current.trim() || null) === ownerUsername) {
        usernameDirtyRef.current = false;
        setUsernameDirty(false);
      }
    } catch (e) {
      if (!mountedRef.current || usernameAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((e as Error).message);
    } finally {
      if (usernameAbortRef.current === controller) {
        usernameAbortRef.current = null;
        usernameSaveRef.current = false;
        if (mountedRef.current) setSavingUsername(false);
      }
    }
  }

  async function compute() {
    if (syncInFlightRef.current) return;
    const controller = new AbortController();
    syncAbortRef.current?.abort();
    syncAbortRef.current = controller;
    syncInFlightRef.current = true;
    setComputing(true);
    try {
      const r = await fetch('/api/egs/sync', { cache: 'no-store', signal: controller.signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const data = decodeEgsSyncPreview(await r.json());
      if (!data) throw new Error(t.common.error);
      if (!mountedRef.current || syncAbortRef.current !== controller || controller.signal.aborted) return;
      setNeedsConfig(data.needsConfig);
      setSuggestions(data.suggestions);
      setPicks(new Set(data.suggestions.map((s) => s.vn_id)));
      setShowAll(false);
    } catch (e) {
      if (!mountedRef.current || syncAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((e as Error).message);
    } finally {
      if (syncAbortRef.current === controller) {
        syncAbortRef.current = null;
        syncInFlightRef.current = false;
        if (mountedRef.current) setComputing(false);
      }
    }
  }

  async function apply() {
    if (picks.size === 0 || syncInFlightRef.current) return;
    const controller = new AbortController();
    syncAbortRef.current?.abort();
    syncAbortRef.current = controller;
    syncInFlightRef.current = true;
    setApplying(true);
    try {
      const r = await fetch('/api/egs/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vn_ids: Array.from(picks) }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const applied = decodeEgsSyncAppliedCount(await r.json());
      if (applied === null) throw new Error(t.common.error);
      if (!mountedRef.current || syncAbortRef.current !== controller || controller.signal.aborted) return;
      toast.success(`${t.egsSync.appliedSummary} (${applied})`);
      setSuggestions([]);
      setPicks(new Set());
      setShowAll(false);
    } catch (e) {
      if (!mountedRef.current || syncAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((e as Error).message);
    } finally {
      if (syncAbortRef.current === controller) {
        syncAbortRef.current = null;
        syncInFlightRef.current = false;
        if (mountedRef.current) setApplying(false);
      }
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
          aria-label={t.egsSync.usernamePlaceholder}
          disabled={configLoading || savingUsername || computing || applying}
          onChange={(e) => {
            setUsername(e.target.value);
            usernameRef.current = e.target.value;
            usernameDirtyRef.current = true;
            setUsernameDirty(true);
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={savingUsername || computing || applying || !usernameDirty}
          onClick={saveUsername}
        >
          {savingUsername ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          {t.common.save}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn"
          onClick={compute}
          disabled={computing || applying || savingUsername || !username.trim()}
        >
          {computing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
          {t.egsSync.compute}
        </button>
        {suggestions.length > 0 && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={apply}
            disabled={computing || applying || savingUsername || picks.size === 0}
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            {t.egsSync.applySelected.replace('{count}', String(picks.size))}
          </button>
        )}
      </div>
      {usernameDirty && (
        <p role="alert" className="rounded-md border border-status-on_hold/40 bg-status-on_hold/10 p-3 text-xs">
          {t.egsSync.unsavedWarning}
        </p>
      )}
      {needsConfig && (
        <p className="rounded-md border border-status-on_hold/40 bg-status-on_hold/10 p-3 text-xs">
          {t.egsSync.needsConfig}
        </p>
      )}
      {suggestions.length > 0 && (
        <ul className="space-y-1.5">
          {(showAll ? suggestions : suggestions.slice(0, SUGGESTIONS_PREVIEW_LIMIT)).map((s) => {
            const picked = picks.has(s.vn_id);
            return (
              <li key={s.vn_id}>
                {/*
                  U-032/U-159/U-161: row used to be a <li role="button"> with
                  a nested <Link>, which made the link interactive content
                  inside another interactive ancestor. Match the steam page
                  pattern: the pick toggle is a real <button>, the title /
                  detail link sits outside the button.
                */}
                <div
                  className={`flex items-center gap-3 rounded-lg border bg-bg-elev/30 p-2 text-xs transition-colors ${
                    picked ? 'border-accent ring-1 ring-accent/30' : 'border-border hover:border-accent/50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => togglePick(s.vn_id)}
                    aria-pressed={picked}
                    aria-label={s.vn_title}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      picked ? 'border-accent bg-accent text-bg' : 'border-border hover:border-accent'
                    }`}
                  >
                    {picked && <Check className="h-3 w-3" aria-hidden />}
                  </button>
                  <Sparkles className="h-3 w-3 shrink-0 text-accent" aria-hidden />
                  <Link
                    href={`/vn/${s.vn_id}`}
                    title={s.vn_title}
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
                        <Check className="h-3 w-3" aria-hidden /> {formatIsoDateString(s.egs_finish_date, locale)}
                      </span>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {suggestions.length > SUGGESTIONS_PREVIEW_LIMIT && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="btn btn-xs"
        >
          {showAll
            ? t.steam.showLess
            : `${t.steam.showAll} (${suggestions.length - SUGGESTIONS_PREVIEW_LIMIT})`}
        </button>
      )}
    </div>
  );
}
