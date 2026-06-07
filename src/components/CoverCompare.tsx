'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, GitCompareArrows, Loader2 } from 'lucide-react';
import { SafeImage } from './SafeImage';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';
import { type SourceChoice } from '@/lib/source-resolve'
import {
  VN_COVER_CHANGED_EVENT,
  type VnCoverChangedDetail,
} from '@/lib/cover-banner-events';

import { readApiError } from '@/lib/api-error-read';
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
  /**
   * Persisted `vn.cover_rotation` from the server render. Applied to
   * the resolved-active image only (not the compare-mode column
   * thumbnails, which need to stay upright for comparison). Updates
   * via the shared `vn:cover-changed` event when sibling controls
   * mutate rotation.
   */
  initialRotation?: 0 | 90 | 180 | 270;
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
  if (customHas) return { used: 'custom', fellBack: pref !== 'auto' };
  if (vndbHas) return { used: 'vndb', fellBack: pref === 'egs' };
  if (egsHas) return { used: 'egs', fellBack: pref === 'vndb' };
  return { used: null, fellBack: false };
}

/**
 * Image variant of FieldCompare - three-way picker over the VNDB cover,
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
  initialRotation = 0,
}: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [compareOpen, setCompareOpen] = useState(false);
  const [optimistic, setOptimistic] = useState<SourceChoice>(current);
  const [saving, setSaving] = useState(false);
  // Track rotation as live state so the active cover repaints
  // instantly when the standalone `<CoverRotationButtons>` (mounted
  // by the VN detail page) dispatches `vn:cover-changed`. Re-syncs
  // with the server-rendered `initialRotation` on router.refresh.
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(initialRotation);
  const identityRef = useRef<string | null>(vnId);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);
  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    identityRef.current = vnId;
    setCompareOpen(false);
    setOptimistic(current);
    setSaving(false);
    setRotation(initialRotation);
    return () => {
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      mutationInFlightRef.current = false;
      identityRef.current = null;
    };
  }, [vnId, current, initialRotation]);
  useEffect(() => {
    function onChanged(e: Event) {
      const detail = (e as CustomEvent<VnCoverChangedDetail>).detail;
      if (!detail || detail.vnId !== vnId) return;
      if (typeof detail.rotation === 'number') {
        setRotation(detail.rotation as 0 | 90 | 180 | 270);
      }
    }
    window.addEventListener(VN_COVER_CHANGED_EVENT, onChanged as EventListener);
    return () =>
      window.removeEventListener(VN_COVER_CHANGED_EVENT, onChanged as EventListener);
  }, [vnId]);

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
    if (mutationInFlightRef.current) return;
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
        body: JSON.stringify({ image: next }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.success(t.toast.saved);
      startTransition(() => router.refresh());
    } catch (e) {
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setOptimistic(previous);
      toast.error((e as Error).message);
    } finally {
      if (identityRef.current === ownerVnId && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        setSaving(false);
      }
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
          // Persisted cover rotation. Compare-mode column thumbnails
          // below stay un-rotated on purpose - the user is comparing
          // raw candidates, not the resolved active view.
          rotation={rotation}
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
              className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-muted hover:border-accent hover:text-accent sm:min-h-0"
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
      <div className={`grid gap-2 ${columns.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {columns.map((col) => (
          <CoverColumn
            key={col.key}
            tone={col.tone}
            label={col.label}
            poster={col.poster}
            alt={`${alt} / ${col.label}`}
            sexual={sexual}
            active={resolved.used === col.key}
            pending={(saving || pending) && optimistic === col.key}
            saving={saving}
            onUse={col.onUse}
            useLabel={col.useLabel}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <button
          type="button"
          onClick={() => persist('auto')}
          disabled={saving || pending}
          className={`min-h-[44px] rounded-md px-2 py-0.5 sm:min-h-0 ${
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
          className="min-h-[44px] rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-muted hover:border-accent hover:text-accent sm:min-h-0"
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
  saving,
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
  saving: boolean;
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
          {active && <Check className="ml-1 inline-block h-3 w-3 align-middle text-accent" aria-hidden />}
        </span>
        {!empty && (
          <button
            type="button"
            onClick={onUse}
            disabled={active || saving}
            className={`inline-flex min-h-[44px] items-center gap-1 rounded px-1.5 py-0.5 sm:min-h-0 ${
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
