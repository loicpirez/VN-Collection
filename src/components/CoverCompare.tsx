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
  /** User-uploaded / picked cover (vn.custom_cover). null when none. */
  custom: Poster;
  sexual: number | null;
  alt: string;
  /** Tailwind class added to each image wrapper. */
  imageClassName?: string;
}

type Column = 'vndb' | 'egs' | 'custom';

function hasPoster(p: Poster): boolean {
  return !!(p.remote || p.local);
}

function pickColumn(
  pref: SourceChoice,
  vndb: Poster,
  egs: Poster,
  custom: Poster,
): { used: Column | null; fellBack: boolean } {
  const vndbHas = hasPoster(vndb);
  const egsHas = hasPoster(egs);
  const customHas = hasPoster(custom);
  // Explicit preference wins when populated; otherwise fall back in
  // priority: custom -> vndb -> egs (custom is the user's own choice
  // so it shouldn't be silently demoted by an empty preferred side).
  if (pref === 'custom' && customHas) return { used: 'custom', fellBack: false };
  if (pref === 'egs' && egsHas) return { used: 'egs', fellBack: false };
  if (pref === 'vndb' && vndbHas) return { used: 'vndb', fellBack: false };
  if (customHas) return { used: 'custom', fellBack: pref !== 'auto' && pref !== 'custom' };
  if (vndbHas) return { used: 'vndb', fellBack: pref === 'egs' };
  if (egsHas) return { used: 'egs', fellBack: pref === 'vndb' };
  return { used: null, fellBack: false };
}

/**
 * Image variant of FieldCompare — three-way picker over the VNDB cover,
 * the EGS cover and the user's custom cover (vn.custom_cover). When any
 * two of the three are populated the user can flip between them; the
 * custom column only renders when there's actually a custom set, while
 * the EGS column renders whenever EGS knows the game.
 */
export function CoverCompare({
  vnId,
  current,
  vndb,
  egs,
  custom,
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
  const customHas = hasPoster(custom);
  const populatedCount = [vndbHas, egsHas, customHas].filter(Boolean).length;
  const canCompare = populatedCount >= 2;
  const resolved = pickColumn(optimistic, vndb, egs, custom);
  const active = resolved.used === 'egs'
    ? egs
    : resolved.used === 'custom'
      ? custom
      : vndb;

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
              {resolved.used && (
                <span className="rounded bg-bg-elev/60 px-1 align-middle normal-case tracking-normal">
                  {resolved.used === 'custom' ? t.coverPicker.custom : resolved.used.toUpperCase()}
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

  const columns: Array<{
    key: Column;
    label: string;
    poster: Poster;
    tone: 'vndb' | 'egs' | 'custom';
    onUse: () => void;
    useLabel: string;
  }> = [];
  columns.push({
    key: 'vndb',
    label: 'VNDB',
    poster: vndb,
    tone: 'vndb',
    onUse: () => persist('vndb'),
    useLabel: t.compare.useVndb,
  });
  columns.push({
    key: 'egs',
    label: 'EGS',
    poster: egs,
    tone: 'egs',
    onUse: () => persist('egs'),
    useLabel: t.compare.useEgs,
  });
  if (customHas) {
    columns.push({
      key: 'custom',
      label: t.coverPicker.custom,
      poster: custom,
      tone: 'custom',
      onUse: () => persist('custom'),
      useLabel: t.compare.useCustom,
    });
  }

  return (
    <div className="space-y-2">
      <div className={`grid gap-2 ${columns.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {columns.map((col) => (
          <CoverColumn
            key={col.key}
            tone={col.tone}
            label={col.label}
            poster={col.poster}
            alt={`${alt} — ${col.label}`}
            sexual={sexual}
            active={resolved.used === col.key}
            pending={pending && optimistic === col.key}
            onUse={col.onUse}
            useLabel={col.useLabel}
          />
        ))}
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
  tone: 'vndb' | 'egs' | 'custom';
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
  const toneClass =
    tone === 'egs'
      ? 'text-accent'
      : tone === 'custom'
        ? 'text-accent-blue'
        : 'text-muted';
  return (
    <div
      className={`rounded-lg border p-1.5 ${
        active ? 'border-accent bg-accent/5' : 'border-border bg-bg-elev/30'
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-1 text-[10px]">
        <span className={`font-bold uppercase tracking-wider ${toneClass}`}>
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
