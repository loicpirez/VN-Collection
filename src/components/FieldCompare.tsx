'use client';
import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Check, GitCompareArrows, Loader2 } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';
import { resolveField, type SourceChoice } from '@/lib/source-resolve';

type Field = 'description' | 'brand' | 'image';

interface Props {
  vnId: string;
  field: Field;
  current: SourceChoice;
  vndb: string | null | undefined;
  egs: string | null | undefined;
  /** How to render a single value (used both when collapsed and inside each column). */
  renderValue: (value: string) => ReactNode;
  /** Label shown next to the toggle and on each column. */
  label: string;
  /** When true, render compact one-column layout (no compare button) even if EGS data exists. */
  forceCollapsed?: boolean;
}

/**
 * Field renderer that:
 *   - Resolves a single value via the user's source preference + VNDB-first auto-fallback.
 *   - Surfaces a "Compare" toggle when both sides have content, expanding into a
 *     two-column side-by-side view with a "Use this" action per column that
 *     persists the choice as the new source pref for the field.
 *
 * Used for description and brand; cover image has its own component because the
 * "value" is an image with optional local mirror.
 */
export function FieldCompare({
  vnId,
  field,
  current,
  vndb,
  egs,
  renderValue,
  label,
  forceCollapsed = false,
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
  const canCompare = !forceCollapsed && vndbHas && egsHas;

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

  if (!compareOpen) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted">
            {label}
            {resolved.used && resolved.used !== (optimistic === 'egs' ? 'egs' : 'vndb') && (
              <span className="ml-2 rounded bg-bg-elev/60 px-1.5 py-0.5 align-middle text-[9px] normal-case tracking-normal text-muted">
                ↪ {resolved.used.toUpperCase()}
              </span>
            )}
          </span>
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
        {resolved.value ? renderValue(resolved.value) : null}
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
          renderValue={renderValue}
          value={vndb ?? null}
          useLabel={t.compare.useVndb}
        />
        <ColumnCard
          tone="egs"
          label="ErogameScape"
          active={optimistic === 'egs' || (optimistic === 'auto' && resolved.used === 'egs')}
          empty={!egsHas}
          onUse={() => persist('egs')}
          pending={pending && optimistic === 'egs'}
          renderValue={renderValue}
          value={egs ?? null}
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

function ColumnCard({
  tone,
  label,
  active,
  empty,
  onUse,
  pending,
  renderValue,
  value,
  useLabel,
}: {
  tone: 'vndb' | 'egs';
  label: string;
  active: boolean;
  empty: boolean;
  onUse: () => void;
  pending: boolean;
  renderValue: (value: string) => ReactNode;
  value: string | null;
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
            {active ? useLabel : useLabel}
          </button>
        )}
      </div>
      {empty ? (
        <p className="text-[11px] italic text-muted/70">—</p>
      ) : value ? (
        renderValue(value)
      ) : null}
    </div>
  );
}
