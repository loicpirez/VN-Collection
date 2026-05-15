'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, GitCompareArrows, Loader2, PinIcon } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';
import { resolveField, type SourceChoice } from '@/lib/source-resolve';
import { VndbMarkup } from './VndbMarkup';

type Field = 'description' | 'brand' | 'image';

interface Props {
  vnId: string;
  field: Field;
  current: SourceChoice;
  vndb: string | null | undefined;
  egs: string | null | undefined;
  label: string;
  /** When true, render compact one-column layout (no compare button) even if EGS data exists. */
  forceCollapsed?: boolean;
  /**
   * Force the tabs to appear even if one side is empty. Used when the VN is
   * matched to both VNDB and EGS so the user can always see which side is
   * blank rather than have the toggle silently disappear.
   */
  egsLinked?: boolean;
}


/**
 * Text-only field renderer (description, etc.). Resolves a single value via the
 * user's source preference + VNDB-first auto-fallback, with a "Compare" toggle
 * that expands into a side-by-side view with per-column "Use this" actions.
 *
 * The renderer is plain `<p>` whitespace-pre-wrap. For brand/dev chips use
 * BrandCompare; for cover images use CoverCompare — both deal with non-string
 * payloads and would otherwise need a function prop (which can't cross the
 * server/client boundary).
 */
export function FieldCompare({
  vnId,
  field,
  current,
  vndb,
  egs,
  label,
  forceCollapsed = false,
  egsLinked = false,
}: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [compareOpen, setCompareOpen] = useState(false);
  const [optimistic, setOptimistic] = useState<SourceChoice>(current);

  const resolved = resolveField(vndb, egs, optimistic);
  const vndbHas = !!vndb && vndb.trim().length > 0;
  const egsHas = !!egs && egs.trim().length > 0;
  const canCompare = !forceCollapsed && (vndbHas || egsHas) && (egsHas || egsLinked);

  async function persist(next: SourceChoice) {
    if (pending) return;
    setOptimistic(next);
    try {
      const r = await fetch(`/api/collection/${vnId}/source-pref`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: next }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.saved);
      startTransition(() => router.refresh());
    } catch (e) {
      setOptimistic(current);
      toast.error((e as Error).message);
    }
  }

  // Display tab — purely visual; flipping it doesn't touch source_pref unless
  // the user explicitly clicks "Use as default".
  const [activeTab, setActiveTab] = useState<'vndb' | 'egs'>(resolved.used === 'egs' ? 'egs' : 'vndb');
  useEffect(() => {
    setActiveTab(resolved.used === 'egs' ? 'egs' : 'vndb');
    // resolved.used is recomputed each render, but `optimistic` is the actual
    // pref signal — re-sync when the pref changes.
  }, [resolved.used]);

  if (!compareOpen) {
    const shownText = activeTab === 'egs' ? (egs ?? '') : (vndb ?? '');
    const isPinned = optimistic === activeTab || (optimistic === 'auto' && resolved.used === activeTab);
    return (
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted">
            {label}
            {resolved.used && resolved.used !== activeTab && (
              <span className="ml-2 rounded bg-bg-elev/60 px-1.5 py-0.5 align-middle text-[9px] normal-case tracking-normal text-muted">
                ↪ {resolved.used.toUpperCase()}
              </span>
            )}
          </span>
          <div className="flex items-center gap-1">
            {canCompare && (
              <div
                role="tablist"
                aria-label={label}
                className="inline-flex rounded-md border border-border bg-bg-elev/30 p-0.5 text-[10px]"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'vndb'}
                  onClick={() => setActiveTab('vndb')}
                  className={`rounded px-2 py-0.5 ${
                    activeTab === 'vndb'
                      ? 'bg-accent text-bg font-bold'
                      : 'text-muted hover:text-white'
                  }`}
                  title={!vndbHas ? t.compare.emptySide : undefined}
                >
                  VNDB{!vndbHas && <span className="ml-0.5 opacity-60">·∅</span>}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'egs'}
                  onClick={() => setActiveTab('egs')}
                  className={`rounded px-2 py-0.5 ${
                    activeTab === 'egs'
                      ? 'bg-accent text-bg font-bold'
                      : 'text-muted hover:text-white'
                  }`}
                  title={!egsHas ? t.compare.emptySide : undefined}
                >
                  EGS{!egsHas && <span className="ml-0.5 opacity-60">·∅</span>}
                </button>
              </div>
            )}
            {canCompare && !isPinned && (
              <button
                type="button"
                onClick={() => persist(activeTab)}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                title={t.compare.setDefault}
              >
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <PinIcon className="h-3 w-3" aria-hidden />}
                {t.compare.setDefault}
              </button>
            )}
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
        </div>
        {shownText ? (
          <Body text={shownText} />
        ) : (
          <p className="text-xs italic text-muted/70">
            {activeTab === 'egs' ? t.compare.noEgsValue : t.compare.noVndbValue}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider text-muted">
          {label} · {t.compare.compareLabel}
        </span>
        <button
          type="button"
          onClick={() => setCompareOpen(false)}
          className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
        >
          {t.common.close}
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <ColumnCard
          tone="vndb"
          label="VNDB"
          active={optimistic === 'vndb' || (optimistic === 'auto' && resolved.used === 'vndb')}
          empty={!vndbHas}
          onUse={() => persist('vndb')}
          pending={pending && optimistic === 'vndb'}
          text={vndb ?? null}
          useLabel={t.compare.useVndb}
        />
        <ColumnCard
          tone="egs"
          label="ErogameScape"
          active={optimistic === 'egs' || (optimistic === 'auto' && resolved.used === 'egs')}
          empty={!egsHas}
          onUse={() => persist('egs')}
          pending={pending && optimistic === 'egs'}
          text={egs ?? null}
          useLabel={t.compare.useEgs}
        />
      </div>
      <div className="mt-2 text-right">
        <button
          type="button"
          onClick={() => persist('auto')}
          disabled={pending}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] ${
            optimistic === 'auto' ? 'bg-accent text-bg font-bold' : 'border border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
          }`}
        >
          {pending && optimistic === 'auto' && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
          {t.compare.useAuto}
        </button>
      </div>
    </div>
  );
}

function Body({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap leading-relaxed text-white/85">
      <VndbMarkup text={text} />
    </div>
  );
}

function ColumnCard({
  tone,
  label,
  active,
  empty,
  onUse,
  pending,
  text,
  useLabel,
}: {
  tone: 'vndb' | 'egs';
  label: string;
  active: boolean;
  empty: boolean;
  onUse: () => void;
  pending: boolean;
  text: string | null;
  useLabel: string;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        active ? 'border-accent bg-accent/5' : 'border-border bg-bg-elev/30'
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${tone === 'egs' ? 'text-accent' : 'text-muted'}`}>
          {label}
          {active && <Check className="ml-1 inline-block h-3 w-3 align-middle text-accent" />}
        </span>
        {!empty && (
          <button
            type="button"
            onClick={onUse}
            disabled={active || pending}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
              active
                ? 'bg-accent/20 text-accent cursor-default'
                : 'border border-border bg-bg-card text-muted hover:border-accent hover:text-accent'
            }`}
          >
            {pending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
            {useLabel}
          </button>
        )}
      </div>
      {empty ? <p className="text-[11px] italic text-muted/70">—</p> : text && <Body text={text} />}
    </div>
  );
}
