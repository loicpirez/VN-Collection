'use client';
import { memo, useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Check, CornerDownRight, GitCompareArrows, Loader2, PinIcon } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';
import { resolveField, type SourceChoice } from '@/lib/source-resolve';
import { VndbMarkup } from './VndbMarkup';

import { readApiError } from '@/lib/api-error-read';
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
 * BrandCompare; for cover images use CoverCompare - both deal with non-string
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
  const [saving, setSaving] = useState(false);
  const identity = `${vnId}|${field}`;
  const identityRef = useRef<string | null>(identity);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    identityRef.current = identity;
    setCompareOpen(false);
    setOptimistic(current);
    setSaving(false);
    return () => {
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      mutationInFlightRef.current = false;
      identityRef.current = null;
    };
  }, [identity, current]);

  const resolved = resolveField(vndb, egs, optimistic);
  const vndbHas = !!vndb && vndb.trim().length > 0;
  const egsHas = !!egs && egs.trim().length > 0;
  const canCompare = !forceCollapsed && (vndbHas || egsHas) && (egsHas || egsLinked);

  async function persist(next: SourceChoice) {
    if (mutationInFlightRef.current) return;
    const ownerIdentity = identity;
    const ownerVnId = vnId;
    const previous = optimistic;
    const controller = new AbortController();
    mutationInFlightRef.current = true;
    mutationAbortRef.current = controller;
    setSaving(true);
    setOptimistic(next);
    try {
      const r = await fetch(`/api/collection/${ownerVnId}/source-pref`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: next }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (identityRef.current !== ownerIdentity || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.success(t.toast.saved);
      startTransition(() => router.refresh());
    } catch (e) {
      if (identityRef.current !== ownerIdentity || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setOptimistic(previous);
      toast.error((e as Error).message);
    } finally {
      if (identityRef.current === ownerIdentity && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        setSaving(false);
      }
    }
  }

  // Display tab - purely visual; flipping it doesn't touch source_pref unless
  // the user explicitly clicks "Use as default".
  const [activeTab, setActiveTab] = useState<'vndb' | 'egs'>(resolved.used === 'egs' ? 'egs' : 'vndb');
  useEffect(() => {
    setActiveTab(resolved.used === 'egs' ? 'egs' : 'vndb');
    // resolved.used is recomputed each render, but `optimistic` is the actual
    // pref signal - re-sync when the pref changes.
  }, [resolved.used]);

  const vndbTabId = useId();
  const egsTabId = useId();
  const vndbPanelId = useId();
  const egsPanelId = useId();
  if (!compareOpen) {
    const shownText = activeTab === 'egs' ? (egs ?? '') : (vndb ?? '');
    const isPinned = optimistic === activeTab || (optimistic === 'auto' && resolved.used === activeTab);
    const activePanelId = activeTab === 'egs' ? egsPanelId : vndbPanelId;
    const activeTabId = activeTab === 'egs' ? egsTabId : vndbTabId;
    return (
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-muted">
            {label}
            {resolved.used && resolved.used !== activeTab && (
              <span className="ml-2 inline-flex items-center gap-1 rounded bg-bg-elev/60 px-1.5 py-0.5 align-middle text-[9px] normal-case tracking-normal text-muted">
                <CornerDownRight className="h-2.5 w-2.5" aria-hidden />
                {resolved.used.toUpperCase()}
              </span>
            )}
          </span>
          <div className="flex items-center gap-1">
            {canCompare && (
              <div
                role="tablist"
                aria-label={label}
                className="inline-flex rounded-md border border-border bg-bg-elev/30 p-0.5 text-[10px]"
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                  e.preventDefault();
                  const next = activeTab === 'vndb' ? 'egs' : 'vndb';
                  setActiveTab(next);
                  document.getElementById(next === 'vndb' ? vndbTabId : egsTabId)?.focus();
                }}
              >
                <button
                  type="button"
                  role="tab"
                  id={vndbTabId}
                  aria-selected={activeTab === 'vndb'}
                  aria-controls={vndbPanelId}
                  tabIndex={activeTab === 'vndb' ? 0 : -1}
                  onClick={() => setActiveTab('vndb')}
                  className={`min-h-[44px] rounded px-2 py-0.5 sm:min-h-0 ${
                    activeTab === 'vndb'
                      ? 'bg-accent text-bg font-bold'
                      : 'text-muted hover:text-white'
                  }`}
                  title={!vndbHas ? t.compare.emptySide : undefined}
                >
                  VNDB{!vndbHas && <Ban className="ml-0.5 inline-block h-2.5 w-2.5 align-middle opacity-60" aria-label={t.compare.emptySide} aria-hidden />}
                </button>
                <button
                  type="button"
                  role="tab"
                  id={egsTabId}
                  aria-selected={activeTab === 'egs'}
                  aria-controls={egsPanelId}
                  tabIndex={activeTab === 'egs' ? 0 : -1}
                  onClick={() => setActiveTab('egs')}
                  className={`min-h-[44px] rounded px-2 py-0.5 sm:min-h-0 ${
                    activeTab === 'egs'
                      ? 'bg-accent text-bg font-bold'
                      : 'text-muted hover:text-white'
                  }`}
                  title={!egsHas ? t.compare.emptySide : undefined}
                >
                  EGS{!egsHas && <Ban className="ml-0.5 inline-block h-2.5 w-2.5 align-middle opacity-60" aria-label={t.compare.emptySide} aria-hidden />}
                </button>
              </div>
            )}
            {canCompare && !isPinned && (
              <button
                type="button"
                onClick={() => persist(activeTab)}
                disabled={saving || pending}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent disabled:opacity-50 sm:min-h-0"
                title={t.compare.setDefault}
              >
                {saving || pending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <PinIcon className="h-3 w-3" aria-hidden />}
                {t.compare.setDefault}
              </button>
            )}
            {canCompare && (
              <button
                type="button"
                onClick={() => setCompareOpen(true)}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent sm:min-h-0"
                title={t.compare.compareTitle}
              >
                <GitCompareArrows className="h-3 w-3" aria-hidden />
                {t.compare.compareBtn}
              </button>
            )}
          </div>
        </div>
        <div role="tabpanel" id={activePanelId} aria-labelledby={activeTabId} tabIndex={0}>
          {shownText ? (
            <Body text={shownText} />
          ) : (
            <p className="text-xs italic text-muted/70">
              {activeTab === 'egs' ? t.compare.noEgsValue : t.compare.noVndbValue}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-muted">
          {label} / {t.compare.compareLabel}
        </span>
        <button
          type="button"
          onClick={() => setCompareOpen(false)}
          className="min-h-[44px] rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent sm:min-h-0"
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
          pending={(saving || pending) && optimistic === 'vndb'}
          saving={saving}
          text={vndb ?? null}
          useLabel={t.compare.useVndb}
        />
        <ColumnCard
          tone="egs"
          label="ErogameScape"
          active={optimistic === 'egs' || (optimistic === 'auto' && resolved.used === 'egs')}
          empty={!egsHas}
          onUse={() => persist('egs')}
          pending={(saving || pending) && optimistic === 'egs'}
          saving={saving}
          text={egs ?? null}
          useLabel={t.compare.useEgs}
        />
      </div>
      <div className="mt-2 text-right">
        <button
          type="button"
          onClick={() => persist('auto')}
          disabled={saving || pending}
          className={`inline-flex min-h-[44px] items-center gap-1 rounded-md px-2 py-0.5 text-[10px] sm:min-h-0 ${
            optimistic === 'auto' ? 'bg-accent text-bg font-bold' : 'border border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
          }`}
        >
          {(saving || pending) && optimistic === 'auto' && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
          {t.compare.useAuto}
        </button>
      </div>
    </div>
  );
}

/**
 * Memoized so flipping tabs / optimistic-pinning / pending state
 * doesn't re-tokenize the description on every render.
 * `<VndbMarkup>` parses BBCode each time it's called - cheap with the
 * O(N) sticky-regex tokenizer, but free is better than cheap.
 */
const Body = memo(function Body({ text }: { text: string }) {
  const t = useT();
  return (
    <div className="whitespace-pre-wrap leading-relaxed text-white/85">
      <VndbMarkup text={text} spoilerLabel={t.spoiler.markupSummary} />
    </div>
  );
});

function ColumnCard({
  tone,
  label,
  active,
  empty,
  onUse,
  pending,
  saving,
  text,
  useLabel,
}: {
  tone: 'vndb' | 'egs';
  label: string;
  active: boolean;
  empty: boolean;
  onUse: () => void;
  pending: boolean;
  saving: boolean;
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
          {active && <Check className="ml-1 inline-block h-3 w-3 align-middle text-accent" aria-hidden />}
        </span>
        {!empty && (
          <button
            type="button"
            onClick={onUse}
            disabled={active || saving}
            className={`inline-flex min-h-[44px] items-center gap-1 rounded px-1.5 py-0.5 text-[10px] sm:min-h-0 ${
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
      {empty ? <p className="text-[11px] italic text-muted/70">-</p> : text && <Body text={text} />}
    </div>
  );
}
