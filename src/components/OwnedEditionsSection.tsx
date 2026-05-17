'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Box,
  CalendarDays,
  Coins,
  HardDriveDownload,
  Home,
  Info,
  MapPin,
  Package,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { SafeImage } from './SafeImage';
import { LangFlag } from './LangFlag';
import { SkeletonRows } from './Skeleton';
import { DateInput } from './DateInput';
import { TagInput } from './TagInput';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import {
  OWNED_EDITIONS_EVENT,
  type OwnedEditionsChangedDetail,
} from './ReleaseOwnedToggle';
import { useT } from '@/lib/i18n/client';
import { BOX_TYPES, LOCATIONS, type BoxType, type Location } from '@/lib/types';
import { ASPECT_KEYS, type AspectKey } from '@/lib/aspect-ratio';
import type { VndbRelease } from '@/lib/vndb-types';

interface OwnedEdition {
  vn_id: string;
  release_id: string;
  notes: string | null;
  location: Location;
  physical_location: string[];
  box_type: BoxType;
  edition_label: string | null;
  condition: string | null;
  price_paid: number | null;
  currency: string | null;
  acquired_date: string | null;
  purchase_place: string | null;
  /**
   * Lowercase VNDB platform code the user physically owns for this
   * edition. NULL when the underlying release is multi-platform AND
   * the user has not picked one yet. Populated automatically via
   * release_meta_cache when the release has exactly one platform.
   */
  owned_platform: string | null;
  /**
   * Release-level platforms list joined server-side from
   * `release_meta_cache`. Drives the per-edition platform picker:
   * empty → free-text input, length=1 → auto-locked, length>1 → select.
   */
  rel_platforms: string[];
  dumped: boolean;
  added_at: number;
  /** Populated server-side via `listOwnedReleasesWithShelfForVn`.
   *  Null when the edition isn't placed on any /shelf?view=layout. */
  shelf:
    | { kind: 'cell'; id: number; name: string; row: number; col: number }
    | { kind: 'display'; id: number; name: string; afterRow: number; position: number }
    | null;
  aspect: {
    width: number | null;
    height: number | null;
    raw_resolution: string | null;
    aspect_key: AspectKey;
    source: 'manual' | 'vndb' | 'unknown';
    note: string | null;
  };
}

const CONDITIONS: { value: string; key: 'new' | 'used' | 'sealed' | 'opened' | 'damaged' }[] = [
  { value: 'sealed', key: 'sealed' },
  { value: 'new', key: 'new' },
  { value: 'opened', key: 'opened' },
  { value: 'used', key: 'used' },
  { value: 'damaged', key: 'damaged' },
];

const COMMON_CURRENCIES = ['JPY', 'EUR', 'USD', 'GBP', 'CNY', 'KRW'];

type AspectOverridePatch =
  | {
      width: number | null;
      height: number | null;
      aspect_key: AspectKey | null;
      note?: string | null;
    }
  | null;

/**
 * Parent VN identity used to fall back when a release has no
 * package cover. The OwnedEditionsSection tile would otherwise show
 * a blank "no image" placeholder for the very common case of
 * digital-only / EGS releases where VNDB hasn't mirrored a
 * `pkgfront`.
 */
export interface ParentVnCover {
  url: string | null;
  localPath: string | null;
  sexual: number | null;
}

interface SectionProps {
  vnId: string;
  parentVnTitle?: string | null;
  parentVnCover?: ParentVnCover;
}

export function OwnedEditionsSection({ vnId, parentVnTitle, parentVnCover }: SectionProps) {
  const t = useT();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [owned, setOwned] = useState<OwnedEdition[]>([]);
  const [releases, setReleases] = useState<VndbRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [knownPlaces, setKnownPlaces] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adderOpen, setAdderOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      const [o, r] = await Promise.all([
        fetch(`/api/collection/${vnId}/owned-releases`, { cache: 'no-store', signal }).then((x) => x.json()),
        fetch(`/api/vn/${vnId}/releases`, { signal }).then((x) => x.json()),
      ]);
      if (signal?.aborted) return;
      setOwned((o.owned ?? []) as OwnedEdition[]);
      setReleases((r.releases ?? []) as VndbRelease[]);
    } catch (e) {
      if ((e as Error).name === 'AbortError' || signal?.aborted) return;
      // ignore — section is optional
    }
  }, [vnId]);

  // Deep-link support: the shelf popover "Choose platform" chip
  // navigates here with `?edit_release=<release_id>` so we open the
  // matching row in editor mode straight away. Without this, the
  // user lands on a collapsed summary and has to find + click the
  // pencil icon themselves — the popover's "Choisir la plateforme"
  // action would feel half-done.
  const searchParams = useSearchParams();
  useEffect(() => {
    const editRel = searchParams.get('edit_release');
    if (editRel && owned.some((o) => o.release_id === editRel)) {
      setEditingId(editRel);
    }
  }, [searchParams, owned]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    reload(ctrl.signal).finally(() => {
      if (!ctrl.signal.aborted) setLoading(false);
    });
    fetch('/api/places', { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        if (!ctrl.signal.aborted) setKnownPlaces(d.places ?? []);
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') {
          // optional suggestions
        }
      });
    return () => ctrl.abort();
  }, [reload]);

  // Re-fetch whenever any other component (ReleasesSection's per-row
  // toggle, /release/[id]'s ReleaseOwnedToggle, future widgets) flips
  // ownership for this VN. Keeps the My-Editions list and the
  // releases list visually in sync without a full page reload.
  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent<OwnedEditionsChangedDetail>).detail;
      if (!detail || detail.vnId !== vnId) return;
      void reload();
    }
    window.addEventListener(OWNED_EDITIONS_EVENT, onChange);
    return () => window.removeEventListener(OWNED_EDITIONS_EVENT, onChange);
  }, [reload, vnId]);

  const releaseMap = useMemo(() => new Map(releases.map((r) => [r.id, r])), [releases]);
  const unownedReleases = useMemo(() => {
    const ownedSet = new Set(owned.map((o) => o.release_id));
    return releases.filter((r) => !ownedSet.has(r.id));
  }, [releases, owned]);

  // Synthetic release id for entries that don't have a VNDB release.
  // Covers two cases:
  //   1. EGS-only VNs (`egs_NNN`) — VNDB knows nothing, so the
  //      releases list is permanently empty and the user could
  //      never shelve them. We surface a single "EGS edition" slot.
  //   2. VNDB VNs whose release data hasn't been downloaded yet —
  //      same UX: a generic "Edition principale" placeholder so
  //      the user can still record where they physically store it.
  const syntheticReleaseId = `synthetic:${vnId}`;
  const canAddSynthetic =
    releases.length === 0 && !owned.some((o) => o.release_id === syntheticReleaseId);

  async function addEdition(releaseId: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/collection/${vnId}/owned-releases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_id: releaseId }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      await reload();
      setAdderOpen(false);
      setEditingId(releaseId);
      toast.success(t.toast.added);
      // Tell sibling components (ReleasesSection's per-row toggle,
      // /release/[id]/ReleaseOwnedToggle) so checkmarks stay in sync.
      window.dispatchEvent(
        new CustomEvent<OwnedEditionsChangedDetail>(OWNED_EDITIONS_EVENT, {
          detail: { vnId, releaseId, isNowOwned: true },
        }),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeEdition(releaseId: string) {
    const ok = await confirm({ message: t.inventory.removeConfirm, tone: 'danger' });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/collection/${vnId}/owned-releases?release_id=${encodeURIComponent(releaseId)}`,
        { method: 'DELETE' },
      );
      if (!r.ok) throw new Error(t.common.error);
      await reload();
      toast.success(t.toast.removed);
      window.dispatchEvent(
        new CustomEvent<OwnedEditionsChangedDetail>(OWNED_EDITIONS_EVENT, {
          detail: { vnId, releaseId, isNowOwned: false },
        }),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdition(
    releaseId: string,
    patch: Partial<OwnedEdition> & { aspect_override?: AspectOverridePatch },
  ) {
    setBusy(true);
    try {
      const r = await fetch(`/api/collection/${vnId}/owned-releases`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_id: releaseId, ...patch }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const d = (await r.json()) as { owned: OwnedEdition[] };
      setOwned(d.owned);
      toast.success(t.toast.saved);
      setEditingId(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
        <SkeletonRows count={2} />
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
        <h3 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
          <Package className="h-4 w-4 text-accent" /> {t.inventory.section}
          {owned.length > 0 && (
            <span className="text-[11px] font-normal text-muted">· {owned.length}</span>
          )}
        </h3>
        <button
          type="button"
          onClick={() => setAdderOpen((v) => !v)}
          disabled={busy || (unownedReleases.length === 0 && !canAddSynthetic)}
          className="btn"
          title={t.inventory.addEdition}
        >
          <Plus className="h-4 w-4" /> {t.inventory.addEdition}
        </button>
      </header>

      {adderOpen && (unownedReleases.length > 0 || canAddSynthetic) && (
        <EditionPicker
          unownedReleases={unownedReleases}
          parentVnCover={parentVnCover}
          parentVnTitle={parentVnTitle ?? null}
          canAddSynthetic={canAddSynthetic}
          syntheticReleaseId={syntheticReleaseId}
          busy={busy}
          onAdd={addEdition}
        />
      )}

      {owned.length === 0 ? (
        <div className="border-t border-border px-4 py-6 text-center text-sm text-muted sm:px-6">
          {t.inventory.empty}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {owned.map((edition) => {
            const release = releaseMap.get(edition.release_id);
            const cover = release?.images.find((img) => img.type === 'pkgfront') ?? release?.images[0] ?? null;
            // Release-level cover wins; otherwise fall back to the
            // parent VN's cover (most common for digital / EGS-only
            // releases that VNDB hasn't mirrored a `pkgfront` for).
            const coverSrc = cover?.url ?? parentVnCover?.url ?? null;
            const coverLocal = cover?.url ? null : parentVnCover?.localPath ?? null;
            const coverSexual = cover?.sexual ?? parentVnCover?.sexual ?? null;
            const coverAlt = release?.title ?? parentVnTitle ?? edition.release_id;
            const isEditing = editingId === edition.release_id;
            return (
              <li key={edition.release_id} className="px-4 py-4 sm:px-6">
                <div className="flex gap-4">
                  <div className="w-24 shrink-0">
                    <SafeImage
                      src={coverSrc}
                      localSrc={coverLocal}
                      sexual={coverSexual}
                      alt={coverAlt}
                      className="aspect-[2/3] w-full rounded-md border border-border"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        {/* Synthetic release ids have no VNDB
                            /release/[id] target — render the title
                            as plain text and skip the info link. */}
                        {edition.release_id.startsWith('synthetic:') ? (
                          <div className="line-clamp-2 text-sm font-bold">
                            {t.inventory.syntheticTitle}
                          </div>
                        ) : (
                          <Link
                            href={`/release/${edition.release_id}`}
                            className="line-clamp-2 text-sm font-bold hover:text-accent"
                          >
                            {release?.title ?? edition.release_id}
                          </Link>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                          {release?.released && <span className="tabular-nums">{release.released}</span>}
                          {release?.languages.map((l) => (
                            <LangFlag key={l.lang} lang={l.lang} className="text-xs" />
                          ))}
                          {release?.platforms.slice(0, 3).map((p) => (
                            <span key={p}>{p}</span>
                          ))}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {!edition.release_id.startsWith('synthetic:') && (
                          <Link
                            href={`/release/${edition.release_id}`}
                            className="tap-target inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-bg-elev hover:text-white"
                            title={t.releases.viewDetails}
                          >
                            <Info className="h-3.5 w-3.5" />
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingId(isEditing ? null : edition.release_id)}
                          className={`tap-target inline-flex h-7 w-7 items-center justify-center rounded ${
                            isEditing ? 'bg-accent text-bg' : 'text-muted hover:bg-bg-elev hover:text-white'
                          }`}
                          title={t.common.edit}
                        >
                          {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeEdition(edition.release_id)}
                          disabled={busy}
                          className="tap-target inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-status-dropped/10 hover:text-status-dropped"
                          title={t.common.delete}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {!isEditing ? (
                      <EditionSummary edition={edition} />
                    ) : (
                      <EditionEditor
                        edition={edition}
                        knownPlaces={knownPlaces}
                        busy={busy}
                        onSave={(patch) => saveEdition(edition.release_id, patch)}
                        onCancel={() => setEditingId(null)}
                      />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function EditionSummary({ edition }: { edition: OwnedEdition }) {
  const t = useT();
  const conditionEntry = CONDITIONS.find((c) => c.value === edition.condition);
  const conditionLabel = conditionEntry ? t.inventory.conditions[conditionEntry.key] : null;
  const price = edition.price_paid != null && edition.price_paid > 0
    ? `${edition.price_paid.toLocaleString()} ${edition.currency ?? ''}`.trim()
    : null;
  const platformMultiAvailable = (edition.rel_platforms?.length ?? 0) > 1;

  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-3">
      {edition.edition_label && (
        <Field icon={<Sparkles className="h-3 w-3" />} label={t.form.editionLabel} value={edition.edition_label} />
      )}
      {edition.owned_platform && (
        <Field
          icon={<Tag className="h-3 w-3" />}
          label={t.form.ownedPlatform}
          value={edition.owned_platform.toUpperCase()}
        />
      )}
      {!edition.owned_platform && platformMultiAvailable && (
        // Warn the user that this multi-platform release has no
        // physical-SKU pick yet — until they choose one in the
        // editor, the shelf popover will widen to the full set
        // (which is what the user complained about).
        <Field
          icon={<Tag className="h-3 w-3" />}
          label={t.form.ownedPlatform}
          value={t.form.ownedPlatformUnset}
          valueClassName="text-status-on_hold"
        />
      )}
      {edition.location !== 'unknown' && (
        <Field icon={<Home className="h-3 w-3" />} label={t.form.location} value={t.locations[edition.location]} />
      )}
      {edition.box_type !== 'none' && (
        <Field icon={<Box className="h-3 w-3" />} label={t.form.boxType} value={t.boxTypes[edition.box_type]} />
      )}
      {conditionLabel && (
        <Field icon={<Tag className="h-3 w-3" />} label={t.inventory.condition} value={conditionLabel} />
      )}
      {price && (
        <Field icon={<Coins className="h-3 w-3" />} label={t.inventory.pricePaid} value={price} />
      )}
      {edition.acquired_date && (
        <Field icon={<CalendarDays className="h-3 w-3" />} label={t.inventory.acquired} value={edition.acquired_date} />
      )}
      {edition.purchase_place && (
        <Field icon={<MapPin className="h-3 w-3" />} label={t.inventory.purchasePlace} value={edition.purchase_place} />
      )}
      {edition.dumped && (
        <Field icon={<HardDriveDownload className="h-3 w-3" />} label={t.form.dumped} value={t.common.yes} valueClassName="text-accent" />
      )}
      {edition.physical_location.length > 0 && (
        <div className="col-span-2 sm:col-span-3">
          <div className="mb-0.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted">
            <MapPin className="h-3 w-3" />
            {t.form.physicalLocation}
          </div>
          {/*
            Each location chip is a `<Link>` to `/?place=<value>` so
            the user can pivot from "what's in this edition" to
            "everything I have at this location" with one click. The
            Library page reads `?place=` server-side and filters via
            `owned_release.physical_location`.
          */}
          <div className="flex flex-wrap gap-1">
            {edition.physical_location.map((p) => (
              <Link
                key={p}
                href={`/?place=${encodeURIComponent(p)}`}
                className="inline-flex items-center rounded border border-border bg-bg-elev/60 px-1.5 py-0.5 text-[10px] transition-colors hover:border-accent hover:text-accent"
                title={p}
              >
                {p}
              </Link>
            ))}
          </div>
        </div>
      )}
      {edition.shelf && (
        <div className="col-span-2 sm:col-span-3">
          <Link
            href={`/shelf?view=layout`}
            className="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent hover:bg-accent/20"
            title={t.inventory.shelfPlacementHint}
          >
            <Package className="h-3 w-3" aria-hidden /> {edition.shelf.name}
            <span className="rounded bg-bg/40 px-1 text-[9px] font-bold tabular-nums">
              {edition.shelf.kind === 'cell'
                ? `${t.shelfLayout.rowLabel.replace('{n}', String(edition.shelf.row + 1))}·${t.shelfLayout.colLabel.replace('{n}', String(edition.shelf.col + 1))}`
                : `${t.shelfLayout.frontDisplay} · ${edition.shelf.position + 1}`}
            </span>
          </Link>
        </div>
      )}
      {edition.aspect?.aspect_key && edition.aspect.aspect_key !== 'unknown' && (
        <Field
          icon={<Info className="h-3 w-3" />}
          label={t.aspect.label}
          value={`${edition.aspect.width && edition.aspect.height ? `${edition.aspect.width}×${edition.aspect.height} · ` : ''}${t.aspect.keys[edition.aspect.aspect_key]} (${edition.aspect.source === 'manual' ? t.aspect.manual : t.aspect.vndb})`}
        />
      )}
      {edition.notes && (
        <div className="col-span-2 sm:col-span-3 mt-1 whitespace-pre-wrap text-[11px] text-muted">
          {edition.notes}
        </div>
      )}
    </dl>
  );
}

function Field({
  icon,
  label,
  value,
  valueClassName = '',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted">
        {icon}
        {label}
      </div>
      <div className={`text-[12px] font-semibold ${valueClassName}`}>{value}</div>
    </div>
  );
}

function EditionEditor({
  edition,
  knownPlaces,
  busy,
  onSave,
  onCancel,
}: {
  edition: OwnedEdition;
  knownPlaces: string[];
  busy: boolean;
  onSave: (patch: Partial<OwnedEdition> & { aspect_override?: AspectOverridePatch }) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [editionLabel, setEditionLabel] = useState(edition.edition_label ?? '');
  const [location, setLocation] = useState<Location>(edition.location);
  const [boxType, setBoxType] = useState<BoxType>(edition.box_type as BoxType);
  const [condition, setCondition] = useState<string>(edition.condition ?? '');
  const [pricePaid, setPricePaid] = useState<string>(edition.price_paid != null ? String(edition.price_paid) : '');
  const [currency, setCurrency] = useState<string>(edition.currency ?? '');
  const [acquired, setAcquired] = useState<string>(edition.acquired_date ?? '');
  const [purchasePlace, setPurchasePlace] = useState<string>(edition.purchase_place ?? '');
  const [dumped, setDumped] = useState<boolean>(edition.dumped);
  const [places, setPlaces] = useState<string[]>(edition.physical_location);
  const [notes, setNotes] = useState<string>(edition.notes ?? '');
  // Per-edition platform picker state. The release_meta_cache list
  // dictates the picker shape:
  //   - 0 platforms → free-text input (synthetic releases / EGS).
  //   - 1 platform  → locked label (auto-set via Layer A/B/C backfill).
  //   - 2+         → select dropdown so the user picks the exact
  //                  physical SKU they own (the user-reported bug
  //                  for r65069 etc.).
  const releasePlatforms = edition.rel_platforms ?? [];
  const [ownedPlatform, setOwnedPlatform] = useState<string>(edition.owned_platform ?? '');
  const [aspectWidth, setAspectWidth] = useState<string>(
    edition.aspect?.source === 'manual' && edition.aspect.width ? String(edition.aspect.width) : '',
  );
  const [aspectHeight, setAspectHeight] = useState<string>(
    edition.aspect?.source === 'manual' && edition.aspect.height ? String(edition.aspect.height) : '',
  );
  const [aspectKey, setAspectKey] = useState<AspectKey | ''>(
    edition.aspect?.source === 'manual' && edition.aspect.aspect_key !== 'unknown'
      ? edition.aspect.aspect_key
      : '',
  );

  function submit() {
    const price = pricePaid.trim() === '' ? null : Number(pricePaid);
    if (price !== null && (Number.isNaN(price) || price < 0)) return;
    const width = aspectWidth.trim() === '' ? null : Number(aspectWidth);
    const height = aspectHeight.trim() === '' ? null : Number(aspectHeight);
    if ((width !== null && (!Number.isInteger(width) || width <= 0)) ||
      (height !== null && (!Number.isInteger(height) || height <= 0))) return;
    onSave({
      edition_label: editionLabel.trim() || null,
      // Single-platform release auto-locks to its sole entry so the
      // user can't accidentally save an empty value (which would
      // re-enable the misleading "all four platforms" popover).
      owned_platform:
        releasePlatforms.length === 1
          ? releasePlatforms[0]
          : ownedPlatform.trim().toLowerCase() || null,
      location,
      box_type: boxType as BoxType,
      condition: (condition || null) as OwnedEdition['condition'],
      price_paid: price,
      currency: currency.trim() ? currency.trim().toUpperCase() : null,
      acquired_date: acquired || null,
      purchase_place: purchasePlace.trim() || null,
      dumped,
      physical_location: places,
      notes: notes || null,
      aspect_override:
        width && height
          ? { width, height, aspect_key: null }
          : aspectKey
            ? { width: null, height: null, aspect_key: aspectKey }
            : null,
    });
  }

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1">
        <span className="label">{t.form.editionLabel}</span>
        <input
          className="input"
          type="text"
          placeholder={t.form.editionLabelPlaceholder}
          value={editionLabel}
          onChange={(e) => setEditionLabel(e.target.value)}
          maxLength={200}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">{t.form.ownedPlatform}</span>
        {releasePlatforms.length === 0 ? (
          <input
            className="input"
            type="text"
            value={ownedPlatform}
            onChange={(e) => setOwnedPlatform(e.target.value.toLowerCase())}
            placeholder="win, ps4, swi…"
            maxLength={16}
          />
        ) : releasePlatforms.length === 1 ? (
          <div className="input flex items-center justify-between gap-2 bg-bg-elev/40 text-muted">
            <span className="uppercase text-white">{releasePlatforms[0]}</span>
            <span className="text-[10px]">{t.form.ownedPlatformLocked}</span>
          </div>
        ) : (
          <select
            className="input"
            value={ownedPlatform}
            onChange={(e) => setOwnedPlatform(e.target.value)}
          >
            <option value="">{t.form.ownedPlatformUnset}</option>
            {releasePlatforms.map((p) => (
              <option key={p} value={p}>{p.toUpperCase()}</option>
            ))}
          </select>
        )}
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">{t.form.location}</span>
        <select className="input" value={location} onChange={(e) => setLocation(e.target.value as Location)}>
          {LOCATIONS.map((l) => (
            <option key={l} value={l}>{t.locations[l]}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">{t.form.boxType}</span>
        <select className="input" value={boxType} onChange={(e) => setBoxType(e.target.value as BoxType)}>
          {BOX_TYPES.map((b) => (
            <option key={b} value={b}>{t.boxTypes[b]}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">{t.inventory.condition}</span>
        <select className="input" value={condition} onChange={(e) => setCondition(e.target.value)}>
          <option value="">—</option>
          {CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>{t.inventory.conditions[c.key]}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">{t.inventory.pricePaid}</span>
        <input
          className="input"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={pricePaid}
          onChange={(e) => setPricePaid(e.target.value)}
          aria-label={t.inventory.pricePaid}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">{t.inventory.currency}</span>
        <input
          className="input"
          type="text"
          list={`currency-${edition.release_id}`}
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          maxLength={3}
          placeholder="JPY"
        />
        <datalist id={`currency-${edition.release_id}`}>
          {COMMON_CURRENCIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">{t.inventory.acquired}</span>
        <DateInput value={acquired} onChange={setAcquired} ariaLabel={t.inventory.acquired} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">{t.inventory.purchasePlace}</span>
        <input
          type="text"
          className="input"
          value={purchasePlace}
          onChange={(e) => setPurchasePlace(e.target.value)}
          placeholder={t.inventory.purchasePlacePlaceholder}
          maxLength={200}
        />
      </label>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
          checked={dumped}
          onChange={(e) => setDumped(e.target.checked)}
        />
        <span className="label leading-tight">{t.form.dumped}</span>
      </label>
      <div className="grid gap-2 rounded-lg border border-border bg-bg-elev/25 p-3 sm:col-span-2 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <span className="label">{t.aspect.overrideTitle}</span>
          <p className="mt-0.5 text-[11px] text-muted">
            {edition.aspect?.source === 'vndb' && edition.aspect.width && edition.aspect.height
              ? t.aspect.vndbDetected
                  .replace('{resolution}', `${edition.aspect.width}×${edition.aspect.height}`)
                  .replace('{aspect}', t.aspect.keys[edition.aspect.aspect_key])
              : t.aspect.overrideHint}
          </p>
        </div>
        <label className="flex flex-col gap-1">
          <span className="label">{t.aspect.width}</span>
          <input
            className="input"
            type="number"
            min={1}
            step={1}
            value={aspectWidth}
            onChange={(e) => setAspectWidth(e.target.value)}
            placeholder="1280"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">{t.aspect.height}</span>
          <input
            className="input"
            type="number"
            min={1}
            step={1}
            value={aspectHeight}
            onChange={(e) => setAspectHeight(e.target.value)}
            placeholder="720"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">{t.aspect.bucket}</span>
          <select className="input" value={aspectKey} onChange={(e) => setAspectKey(e.target.value as AspectKey | '')}>
            <option value="">{t.aspect.auto}</option>
            {ASPECT_KEYS.filter((k) => k !== 'unknown').map((k) => (
              <option key={k} value={k}>{t.aspect.keys[k]}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-1 sm:col-span-2">
        <span className="label">{t.form.physicalLocation}</span>
        <TagInput
          values={places}
          onChange={setPlaces}
          placeholder={t.form.physicalLocationPlaceholder}
          suggestions={knownPlaces}
          maxLength={200}
          maxValues={32}
        />
      </div>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="label">{t.inventory.notes}</span>
        <textarea
          className="input min-h-[60px]"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t.inventory.notesPlaceholder}
          rows={3}
        />
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          {t.common.cancel}
        </button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
          <Save className="h-4 w-4" /> {t.common.save}
        </button>
      </div>
    </div>
  );
}

function fmtRes(r: VndbRelease['resolution']): string | null {
  if (r == null) return null;
  if (typeof r === 'string') return r;
  return `${r[0]}×${r[1]}`;
}

/**
 * "Add edition" picker. Lists every release of the VN that the user
 * doesn't already own, with enough info per row to choose correctly:
 * cover (falling back to the parent VN cover), title + alttitle,
 * release date, languages with MTL flag, platforms, dev / pub,
 * resolution, and the official / patch / freeware / uncensored / ero
 * flags. A debounced search + filter chips narrow the list — there's
 * no arbitrary "first 30" cap.
 *
 * The synthetic "Main edition" tile is still shown when no real VNDB
 * release exists, for EGS-only items.
 */
function EditionPicker({
  unownedReleases,
  parentVnCover,
  parentVnTitle,
  canAddSynthetic,
  syntheticReleaseId,
  busy,
  onAdd,
}: {
  unownedReleases: VndbRelease[];
  parentVnCover?: ParentVnCover;
  parentVnTitle: string | null;
  canAddSynthetic: boolean;
  syntheticReleaseId: string;
  busy: boolean;
  onAdd: (releaseId: string) => void;
}) {
  const t = useT();
  const [search, setSearch] = useState('');
  const [filterLang, setFilterLang] = useState<string>('');
  const [filterPlatform, setFilterPlatform] = useState<string>('');
  // Tri-state flag filters: undefined = all, true = only YES, false = only NO.
  const [filterOfficial, setFilterOfficial] = useState<'all' | 'official' | 'patch'>('all');
  const [filterEro, setFilterEro] = useState<'all' | 'ero' | 'noero'>('all');
  const [filterMtl, setFilterMtl] = useState<'all' | 'mtl' | 'nomtl'>('all');

  // Build the language/platform option sets from the actual data so
  // every chip is meaningful (no dead options like "Klingon").
  const allLangs = useMemo(() => {
    const set = new Set<string>();
    for (const r of unownedReleases) for (const l of r.languages) set.add(l.lang);
    return Array.from(set).sort();
  }, [unownedReleases]);
  const allPlatforms = useMemo(() => {
    const set = new Set<string>();
    for (const r of unownedReleases) for (const p of r.platforms) set.add(p);
    return Array.from(set).sort();
  }, [unownedReleases]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return unownedReleases.filter((r) => {
      if (filterLang && !r.languages.some((l) => l.lang === filterLang)) return false;
      if (filterPlatform && !r.platforms.includes(filterPlatform)) return false;
      if (filterOfficial === 'official' && !r.official) return false;
      if (filterOfficial === 'patch' && !r.patch) return false;
      if (filterEro === 'ero' && !r.has_ero) return false;
      if (filterEro === 'noero' && r.has_ero) return false;
      if (filterMtl === 'mtl' && !r.languages.some((l) => l.mtl)) return false;
      if (filterMtl === 'nomtl' && r.languages.some((l) => l.mtl)) return false;
      if (!q) return true;
      const blob = [
        r.title,
        r.alttitle ?? '',
        r.engine ?? '',
        r.producers.map((p) => p.name).join(' '),
        r.languages.map((l) => l.lang).join(' '),
        r.platforms.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [unownedReleases, search, filterLang, filterPlatform, filterOfficial, filterEro, filterMtl]);

  function resetFilters() {
    setSearch('');
    setFilterLang('');
    setFilterPlatform('');
    setFilterOfficial('all');
    setFilterEro('all');
    setFilterMtl('all');
  }

  const filtersActive =
    !!search ||
    !!filterLang ||
    !!filterPlatform ||
    filterOfficial !== 'all' ||
    filterEro !== 'all' ||
    filterMtl !== 'all';

  return (
    <div className="border-t border-border bg-bg-elev/30 px-4 py-3 sm:px-6">
      <p className="mb-2 text-[11px] uppercase tracking-wider text-muted">
        {unownedReleases.length > 0 ? t.inventory.pickRelease : t.inventory.pickSynthetic}
      </p>
      {unownedReleases.length > 0 && (
        <div className="mb-3 space-y-2">
          <input
            type="search"
            className="input w-full text-xs"
            placeholder={t.inventory.pickerSearchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t.inventory.pickerSearchPlaceholder}
          />
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <select
              value={filterLang}
              onChange={(e) => setFilterLang(e.target.value)}
              className="input h-7 py-0 text-[11px]"
              aria-label={t.inventory.pickerFilterLang}
            >
              <option value="">{t.inventory.pickerFilterLang}</option>
              {allLangs.map((l) => (
                <option key={l} value={l}>{l.toUpperCase()}</option>
              ))}
            </select>
            <select
              value={filterPlatform}
              onChange={(e) => setFilterPlatform(e.target.value)}
              className="input h-7 py-0 text-[11px]"
              aria-label={t.inventory.pickerFilterPlatform}
            >
              <option value="">{t.inventory.pickerFilterPlatform}</option>
              {allPlatforms.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={filterOfficial}
              onChange={(e) => setFilterOfficial(e.target.value as typeof filterOfficial)}
              className="input h-7 py-0 text-[11px]"
              aria-label={t.inventory.pickerFilterType}
            >
              <option value="all">{t.inventory.pickerFilterType}</option>
              <option value="official">{t.releases.official}</option>
              <option value="patch">{t.releases.patch}</option>
            </select>
            <select
              value={filterEro}
              onChange={(e) => setFilterEro(e.target.value as typeof filterEro)}
              className="input h-7 py-0 text-[11px]"
              aria-label={t.inventory.pickerFilterEro}
            >
              <option value="all">{t.inventory.pickerFilterEro}</option>
              <option value="ero">{t.releases.hasEro}</option>
              <option value="noero">{t.inventory.pickerNoEro}</option>
            </select>
            <select
              value={filterMtl}
              onChange={(e) => setFilterMtl(e.target.value as typeof filterMtl)}
              className="input h-7 py-0 text-[11px]"
              aria-label={t.inventory.pickerFilterMtl}
            >
              <option value="all">{t.inventory.pickerFilterMtl}</option>
              <option value="mtl">{t.inventory.pickerOnlyMtl}</option>
              <option value="nomtl">{t.inventory.pickerNoMtl}</option>
            </select>
            {filtersActive && (
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-md border border-border bg-bg-card px-2 py-1 text-[11px] text-muted hover:text-white"
              >
                {t.inventory.pickerFilterReset}
              </button>
            )}
            <span className="ml-auto text-[10px] text-muted">
              {t.inventory.pickerResults
                .replace('{count}', String(filtered.length))
                .replace('{total}', String(unownedReleases.length))}
            </span>
          </div>
        </div>
      )}
      <div className="grid max-h-[60vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {canAddSynthetic && (
          <button
            type="button"
            onClick={() => onAdd(syntheticReleaseId)}
            disabled={busy}
            className="flex gap-2 rounded-md border border-accent/50 bg-accent/5 p-2 text-left text-xs transition-colors hover:border-accent disabled:opacity-50"
          >
            <div className="w-12 shrink-0">
              <SafeImage
                src={parentVnCover?.url ?? null}
                localSrc={parentVnCover?.localPath ?? null}
                sexual={parentVnCover?.sexual ?? null}
                alt={parentVnTitle ?? t.inventory.syntheticTitle}
                className="aspect-[2/3] w-full rounded border border-border"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 font-semibold">{t.inventory.syntheticTitle}</div>
              <div className="text-[11px] text-muted">{t.inventory.syntheticHint}</div>
            </div>
          </button>
        )}
        {filtered.length === 0 && unownedReleases.length > 0 && (
          <p className="col-span-full p-3 text-center text-xs text-muted">
            {t.inventory.pickerNoResults}
          </p>
        )}
        {filtered.map((r) => {
          const cover = r.images.find((img) => img.type === 'pkgfront') ?? r.images[0] ?? null;
          const coverSrc = cover?.url ?? parentVnCover?.url ?? null;
          const coverLocal = cover?.url ? null : parentVnCover?.localPath ?? null;
          const coverSexual = cover?.sexual ?? parentVnCover?.sexual ?? null;
          const dev = r.producers.filter((p) => p.developer).map((p) => p.name).join(', ');
          const pub = r.producers.filter((p) => p.publisher).map((p) => p.name).join(', ');
          const res = fmtRes(r.resolution);
          const flags: { key: string; label: string }[] = [];
          if (r.official) flags.push({ key: 'official', label: t.releases.official });
          if (r.patch) flags.push({ key: 'patch', label: t.releases.patch });
          if (r.freeware) flags.push({ key: 'freeware', label: t.releases.freeware });
          if (r.uncensored) flags.push({ key: 'uncensored', label: t.releases.uncensored });
          if (r.has_ero) flags.push({ key: 'ero', label: t.releases.hasEro });
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onAdd(r.id)}
              disabled={busy}
              className="flex gap-2 rounded-md border border-border bg-bg-card p-2 text-left text-xs transition-colors hover:border-accent disabled:opacity-50"
            >
              <div className="w-12 shrink-0">
                <SafeImage
                  src={coverSrc}
                  localSrc={coverLocal}
                  sexual={coverSexual}
                  alt={r.title}
                  className="aspect-[2/3] w-full rounded border border-border"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-[12px] font-semibold">{r.title}</div>
                {r.alttitle && r.alttitle !== r.title && (
                  <div className="line-clamp-1 text-[10px] text-muted">{r.alttitle}</div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted">
                  {r.released && <span className="tabular-nums">{r.released}</span>}
                  {r.languages.slice(0, 4).map((l) => (
                    <span key={l.lang} className="inline-flex items-center gap-0.5">
                      <LangFlag lang={l.lang} className="text-[10px]" />
                      {l.mtl && (
                        <span
                          className="rounded bg-status-on_hold/20 px-1 text-[8px] uppercase tracking-wide text-status-on_hold"
                          title={t.inventory.pickerOnlyMtl}
                        >
                          MTL
                        </span>
                      )}
                    </span>
                  ))}
                  {r.platforms.slice(0, 3).map((p) => (
                    <span key={p}>{p}</span>
                  ))}
                  {res && <span>{res}</span>}
                </div>
                {(dev || pub) && (
                  <div className="mt-0.5 line-clamp-1 text-[10px] text-muted">
                    {dev && <b className="text-white/80">{dev}</b>}
                    {dev && pub && ' · '}
                    {pub}
                  </div>
                )}
                {flags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {flags.map((f) => (
                      <span
                        key={f.key}
                        className="rounded bg-bg-elev px-1 py-0.5 text-[9px] uppercase tracking-wide text-accent"
                      >
                        {f.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
