'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, GitCompareArrows, Loader2 } from 'lucide-react';
import { SafeImage } from './SafeImage';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';
import { resolveField, type SourceChoice } from '@/lib/source-resolve';

interface Poster {
  remote: string | null;
  local: string | null;
}

interface Props {
  vnId: string;
  current: SourceChoice;
  vndb: Poster;
  egs: Poster;
  sexual: number | null;
  alt: string;
  /** Tailwind class added to each image wrapper. */
  imageClassName?: string;
}

function hasPoster(p: Poster): boolean {
  return !!(p.remote || p.local);
}

/**
 * Image variant of FieldCompare — picks between VNDB cover and the EGS cover
 * (the EGS image is best-effort, so we still render the column when only
 * a remote URL is set; SafeImage shows the fallback if it 404s).
 */
export function CoverCompare({
  vnId,
  current,
  vndb,
  egs,
  sexual,
  alt,
  imageClassName = 'aspect-[2/3] w-full rounded-xl shadow-card',
}: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [compareOpen, setCompareOpen] = useState(false);
  const [optimistic, setOptimistic] = useState<SourceChoice>(current);

  const vndbHas = hasPoster(vndb);
  const egsHas = hasPoster(egs);
  const canCompare = vndbHas && egsHas;
  const resolved = resolveField(vndbHas ? 'vndb' : null, egsHas ? 'egs' : null, optimistic);
  const active = resolved.used === 'egs' ? egs : vndb;

  async function persist(next: SourceChoice) {
    if (pending) return;
    setOptimistic(next);
    try {
      const r = await fetch(`/api/collection/${vnId}/source-pref`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: next }),
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
      <div className="space-y-2">
        <SafeImage
          src={active.remote}
          localSrc={active.local}
          alt={alt}
          sexual={sexual}
          className={imageClassName}
        />
        {canCompare && (
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <span className="inline-flex items-center gap-1 text-muted">
              {t.detail.cover}
              {resolved.used && resolved.used !== (optimistic === 'egs' ? 'egs' : 'vndb') && (
                <span className="rounded bg-bg-elev/60 px-1 align-middle normal-case tracking-normal">
                  ↪ {resolved.used.toUpperCase()}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => setCompareOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-muted hover:border-accent hover:text-accent"
              title={t.compare.compareTitle}
            >
              <GitCompareArrows className="h-3 w-3" aria-hidden />
              {t.compare.compareBtn}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <CoverColumn
          tone="vndb"
          label="VNDB"
          poster={vndb}
          alt={`${alt} — VNDB`}
          sexual={sexual}
          active={resolved.used === 'vndb'}
          pending={pending && optimistic === 'vndb'}
          onUse={() => persist('vndb')}
          useLabel={t.compare.useVndb}
        />
        <CoverColumn
          tone="egs"
          label="EGS"
          poster={egs}
          alt={`${alt} — EGS`}
          sexual={sexual}
          active={resolved.used === 'egs'}
          pending={pending && optimistic === 'egs'}
          onUse={() => persist('egs')}
          useLabel={t.compare.useEgs}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <button
          type="button"
          onClick={() => persist('auto')}
          disabled={pending}
          className={`rounded-md px-2 py-0.5 ${
            optimistic === 'auto'
              ? 'bg-accent text-bg font-bold'
              : 'border border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
          }`}
        >
          {t.compare.useAuto}
        </button>
        <button
          type="button"
          onClick={() => setCompareOpen(false)}
          className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-muted hover:border-accent hover:text-accent"
        >
          {t.common.close}
        </button>
      </div>
    </div>
  );
}

function CoverColumn({
  tone,
  label,
  poster,
  alt,
  sexual,
  active,
  pending,
  onUse,
  useLabel,
}: {
  tone: 'vndb' | 'egs';
  label: string;
  poster: Poster;
  alt: string;
  sexual: number | null;
  active: boolean;
  pending: boolean;
  onUse: () => void;
  useLabel: string;
}) {
  const empty = !hasPoster(poster);
  return (
    <div
      className={`rounded-lg border p-1.5 ${
        active ? 'border-accent bg-accent/5' : 'border-border bg-bg-elev/30'
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-1 text-[10px]">
        <span className={`font-bold uppercase tracking-wider ${tone === 'egs' ? 'text-accent' : 'text-muted'}`}>
          {label}
          {active && <Check className="ml-1 inline-block h-3 w-3 align-middle text-accent" />}
        </span>
        {!empty && (
          <button
            type="button"
            onClick={onUse}
            disabled={active || pending}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
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
      <SafeImage
        src={poster.remote}
        localSrc={poster.local}
        alt={alt}
        sexual={sexual}
        className="aspect-[2/3] w-full rounded-md"
      />
    </div>
  );
}
