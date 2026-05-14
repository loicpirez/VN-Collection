'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clock, GitCompareArrows, Hourglass, Loader2, Sparkles, User as UserIcon } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';
import type { SourceChoice } from '@/lib/source-resolve';

interface Props {
  vnId: string;
  /** Currently persisted preference for `image`-style playtime resolution. */
  current: SourceChoice;
  /** VNDB community average length, minutes. */
  vndb: number | null;
  /** ErogameScape user-review median, minutes. */
  egs: number | null;
  /** User's own recorded playtime, minutes. */
  mine: number | null;
}

type Tab = 'vndb' | 'egs' | 'mine' | 'combined';

function fmt(min: number | null): string {
  if (min == null || min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/**
 * Numeric variant of FieldCompare for playtime. Three independent
 * sources (VNDB community length / EGS user-review median / user's
 * own recorded time) and a derived "Combined" column = (VNDB + EGS) / 2
 * when both are populated, otherwise whichever single side has a
 * value. The user can pin any of the four as the canonical playtime
 * via `source_pref.playtime`.
 *
 * The active column drives the inline display on the detail page (see
 * /vn/[id]/page.tsx). When unset / `auto` we fall back to: combined →
 * VNDB → EGS → user — community values rank first because the user
 * usually wants "how long does this VN take" rather than their own
 * personal log.
 */
export function PlaytimeCompare({ vnId, current, vndb, egs, mine }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [compareOpen, setCompareOpen] = useState(false);
  const [optimistic, setOptimistic] = useState<SourceChoice>(current);

  const vndbHas = vndb != null && vndb > 0;
  const egsHas = egs != null && egs > 0;
  const mineHas = mine != null && mine > 0;
  const combinedHas = vndbHas || egsHas;
  const combinedValue = vndbHas && egsHas
    ? Math.round(((vndb as number) + (egs as number)) / 2)
    : vndbHas
      ? vndb
      : egsHas
        ? egs
        : null;

  // Resolution priority: explicit pref > combined > vndb > egs > mine.
  function pickColumn(pref: SourceChoice): Tab {
    if (pref === 'custom' && mineHas) return 'mine';
    if (pref === 'vndb' && vndbHas) return 'vndb';
    if (pref === 'egs' && egsHas) return 'egs';
    if (combinedHas) return 'combined';
    if (vndbHas) return 'vndb';
    if (egsHas) return 'egs';
    return 'mine';
  }
  const activeTab: Tab = pickColumn(optimistic);
  const headlineValue =
    activeTab === 'combined'
      ? combinedValue
      : activeTab === 'egs'
        ? egs
        : activeTab === 'vndb'
          ? vndb
          : mine;

  async function persist(next: SourceChoice) {
    if (pending) return;
    setOptimistic(next);
    try {
      const r = await fetch(`/api/collection/${vnId}/source-pref`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playtime: next }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.saved);
      startTransition(() => router.refresh());
    } catch (e) {
      setOptimistic(current);
      toast.error((e as Error).message);
    }
  }

  const populated = [vndbHas, egsHas, mineHas].filter(Boolean).length;
  const canCompare = populated >= 2 || (combinedHas && mineHas);

  if (!compareOpen) {
    const IconForTab =
      activeTab === 'mine' ? UserIcon : activeTab === 'combined' ? Sparkles : activeTab === 'egs' ? Sparkles : Hourglass;
    return (
      <div className="inline-flex items-center gap-2 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1">
          <IconForTab className="h-3 w-3" aria-hidden />
          <span className="font-bold uppercase tracking-wider">{t.playtime[activeTab]}</span>
        </span>
        <span className="font-semibold text-white/85">{fmt(headlineValue)}</span>
        {canCompare && (
          <button
            type="button"
            onClick={() => setCompareOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
            title={t.compare.compareTitle}
          >
            <GitCompareArrows className="h-3 w-3" aria-hidden />
            {t.compare.compareBtn}
          </button>
        )}
      </div>
    );
  }

  const cols: Array<{
    key: Tab;
    icon: typeof UserIcon;
    label: string;
    value: number | null;
    onUse: () => void;
    useLabel: string;
  }> = [
    { key: 'vndb', icon: Hourglass, label: 'VNDB', value: vndb, onUse: () => persist('vndb'), useLabel: t.compare.useVndb },
    { key: 'egs', icon: Sparkles, label: 'EGS', value: egs, onUse: () => persist('egs'), useLabel: t.compare.useEgs },
    {
      key: 'combined',
      icon: Sparkles,
      label: t.playtime.combined,
      value: combinedValue,
      onUse: () => persist('auto'),
      useLabel: t.compare.useAuto,
    },
    { key: 'mine', icon: Clock, label: t.playtime.mine, value: mine, onUse: () => persist('custom'), useLabel: t.compare.useCustom },
  ];

  return (
    <div className="space-y-2 rounded-lg border border-border bg-bg-elev/30 p-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cols.map((c) => {
          const active = activeTab === c.key;
          const empty = c.value == null || c.value <= 0;
          return (
            <div
              key={c.key}
              className={`rounded-md border p-2 text-center ${
                active ? 'border-accent bg-accent/5' : 'border-border bg-bg-card'
              }`}
            >
              <div className={`mb-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${
                c.key === 'vndb' ? 'text-muted' : c.key === 'egs' ? 'text-accent' : c.key === 'mine' ? 'text-status-playing' : 'text-accent-blue'
              }`}>
                <c.icon className="h-3 w-3" aria-hidden />
                {c.label}
                {active && <Check className="ml-0.5 inline-block h-3 w-3 text-accent" />}
              </div>
              <div className={`text-sm font-mono ${empty ? 'text-muted/60' : 'text-white/90'}`}>
                {fmt(c.value)}
              </div>
              <button
                type="button"
                onClick={c.onUse}
                disabled={empty || (active && optimistic !== 'auto')}
                className={`mt-1 inline-flex w-full items-center justify-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
                  active
                    ? 'bg-accent/20 text-accent cursor-default'
                    : empty
                      ? 'border border-border bg-bg-elev/30 text-muted/40 cursor-not-allowed'
                      : 'border border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
                }`}
              >
                {pending && optimistic === (c.key === 'combined' ? 'auto' : c.key === 'mine' ? 'custom' : c.key) && (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                )}
                {c.useLabel}
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCompareOpen(false)}
          className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
        >
          {t.common.close}
        </button>
      </div>
    </div>
  );
}
