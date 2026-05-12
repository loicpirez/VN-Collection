'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Gamepad2, Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from '@/components/ToastProvider';

interface Suggestion {
  vn_id: string;
  vn_title: string;
  steam_appid: number;
  steam_name: string;
  current_minutes: number;
  steam_minutes: number;
  delta: number;
}

function fmt(m: number): string {
  if (m <= 0) return '0';
  const h = Math.floor(m / 60);
  const mn = m % 60;
  if (h && mn) return `${h}h ${mn}m`;
  if (h) return `${h}h`;
  return `${mn}m`;
}

export default function SteamSyncPage() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch('/api/steam/sync')
      .then((r) => r.json())
      .then((d: { ok: boolean; suggestions?: Suggestion[]; error?: string }) => {
        if (d.ok) {
          setSuggestions(d.suggestions ?? []);
          setPicks(new Set((d.suggestions ?? []).map((s) => s.vn_id)));
        } else {
          setError(d.error ?? t.common.error);
        }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [t.common.error]);

  function toggle(id: string) {
    setPicks((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function apply() {
    const applies = suggestions
      .filter((s) => picks.has(s.vn_id))
      .map((s) => ({ vn_id: s.vn_id, playtime_minutes: s.steam_minutes }));
    if (applies.length === 0) return;
    setApplying(true);
    try {
      const r = await fetch('/api/steam/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applies }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const d = (await r.json()) as { applied: number };
      toast.success(t.steam.applied.replace('{n}', String(d.applied)));
      router.push('/');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/data" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.nav.data}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <Gamepad2 className="h-6 w-6 text-accent" /> {t.steam.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.steam.subtitle}</p>
      </header>

      {loading && (
        <p className="rounded-xl border border-border bg-bg-card p-6 text-sm text-muted">
          <Loader2 className="mr-2 inline-block h-4 w-4 animate-spin" />
          {t.common.loading}
        </p>
      )}

      {error && (
        <div className="rounded-xl border border-status-dropped/40 bg-status-dropped/10 p-4 text-sm text-status-dropped">
          {error}
        </div>
      )}

      {!loading && !error && suggestions.length === 0 && (
        <p className="rounded-xl border border-border bg-bg-card p-6 text-sm text-muted">
          {t.steam.empty}
        </p>
      )}

      {suggestions.length > 0 && (
        <>
          <ul className="space-y-2">
            {suggestions.map((s) => {
              const picked = picks.has(s.vn_id);
              return (
                <li
                  key={s.vn_id}
                  onClick={() => toggle(s.vn_id)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-bg-card p-3 transition-colors ${
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
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{s.vn_title}</p>
                    <p className="text-[11px] text-muted">{s.steam_name} · appid {s.steam_appid}</p>
                  </div>
                  <span className="text-right text-xs">
                    <span className="block text-muted">{fmt(s.current_minutes)} → <span className="text-accent">{fmt(s.steam_minutes)}</span></span>
                    <span className="block font-mono text-[10px] text-accent">+{fmt(s.delta)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setPicks(new Set())} className="btn text-sm">
              {t.steam.deselectAll}
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={applying || picks.size === 0}
              className="btn btn-primary"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {t.steam.apply.replace('{n}', String(picks.size))}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
