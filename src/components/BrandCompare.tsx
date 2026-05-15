'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, CornerDownRight, GitCompareArrows, Loader2 } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';
import { resolveField, type SourceChoice } from '@/lib/source-resolve';

interface Developer {
  id: string;
  name: string;
}

interface Props {
  vnId: string;
  current: SourceChoice;
  vndbDevs: Developer[];
  egsBrand: string | null;
  label: string;
}

/**
 * Brand / developer field with a side-by-side compare view. VNDB renders one
 * <Link> chip per developer (routes to /producer/[id]); EGS renders a single
 * plain chip with the brand name. Separated from FieldCompare because the
 * VNDB column is structured data (not a string), and function props can't
 * cross the server/client boundary in Next.js App Router.
 */
export function BrandCompare({ vnId, current, vndbDevs, egsBrand, label }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [compareOpen, setCompareOpen] = useState(false);
  const [optimistic, setOptimistic] = useState<SourceChoice>(current);

  const vndbHas = vndbDevs.length > 0;
  const egsHas = !!egsBrand && egsBrand.trim().length > 0;
  const canCompare = vndbHas && egsHas;
  const resolved = resolveField(
    vndbHas ? 'vndb' : null,
    egsHas ? 'egs' : null,
    optimistic,
  );

  async function persist(next: SourceChoice) {
    if (pending) return;
    setOptimistic(next);
    try {
      const r = await fetch(`/api/collection/${vnId}/source-pref`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: next }),
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
              <span className="ml-2 inline-flex items-center gap-1 rounded bg-bg-elev/60 px-1.5 py-0.5 align-middle text-[9px] normal-case tracking-normal text-muted">
                <CornerDownRight className="h-2.5 w-2.5" aria-hidden />
                {resolved.used.toUpperCase()}
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
        {resolved.used === 'egs' && egsBrand ? (
          <span className="inline-block rounded-md border border-border bg-bg-elev px-2 py-0.5 text-xs">
            {egsBrand}
          </span>
        ) : (
          <DevChips devs={vndbDevs} />
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
        <Column
          tone="vndb"
          label="VNDB"
          active={optimistic === 'vndb' || (optimistic === 'auto' && resolved.used === 'vndb')}
          empty={!vndbHas}
          onUse={() => persist('vndb')}
          pending={pending && optimistic === 'vndb'}
          useLabel={t.compare.useVndb}
        >
          <DevChips devs={vndbDevs} />
        </Column>
        <Column
          tone="egs"
          label="ErogameScape"
          active={optimistic === 'egs' || (optimistic === 'auto' && resolved.used === 'egs')}
          empty={!egsHas}
          onUse={() => persist('egs')}
          pending={pending && optimistic === 'egs'}
          useLabel={t.compare.useEgs}
        >
          {egsBrand && (
            <span className="inline-block rounded-md border border-border bg-bg-elev px-2 py-0.5 text-xs">
              {egsBrand}
            </span>
          )}
        </Column>
      </div>
      <div className="mt-2 text-right">
        <button
          type="button"
          onClick={() => persist('auto')}
          disabled={pending}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] ${
            optimistic === 'auto'
              ? 'bg-accent text-bg font-bold'
              : 'border border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
          }`}
        >
          {pending && optimistic === 'auto' && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
          {t.compare.useAuto}
        </button>
      </div>
    </div>
  );
}

function DevChips({ devs }: { devs: Developer[] }) {
  if (devs.length === 0) {
    return <p className="text-[11px] italic text-muted/70">—</p>;
  }
  return (
    <div className="flex flex-wrap gap-2 font-semibold">
      {devs.map((d) => (
        <Link
          key={d.id}
          href={`/producer/${d.id}`}
          className="rounded-md border border-border bg-bg-elev px-2 py-0.5 text-xs hover:border-accent hover:text-accent"
        >
          {d.name}
        </Link>
      ))}
    </div>
  );
}

function Column({
  tone,
  label,
  active,
  empty,
  onUse,
  pending,
  useLabel,
  children,
}: {
  tone: 'vndb' | 'egs';
  label: string;
  active: boolean;
  empty: boolean;
  onUse: () => void;
  pending: boolean;
  useLabel: string;
  children: React.ReactNode;
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
      {empty ? <p className="text-[11px] italic text-muted/70">—</p> : children}
    </div>
  );
}
