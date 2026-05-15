'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
import { useT } from '@/lib/i18n/client';
import { BOX_TYPES, LOCATIONS, type BoxType, type Location } from '@/lib/types';
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
  dumped: boolean;
  added_at: number;
}

const CONDITIONS: { value: string; key: 'new' | 'used' | 'sealed' | 'opened' | 'damaged' }[] = [
  { value: 'sealed', key: 'sealed' },
  { value: 'new', key: 'new' },
  { value: 'opened', key: 'opened' },
  { value: 'used', key: 'used' },
  { value: 'damaged', key: 'damaged' },
];

const COMMON_CURRENCIES = ['JPY', 'EUR', 'USD', 'GBP', 'CNY', 'KRW'];

export function OwnedEditionsSection({ vnId }: { vnId: string }) {
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

  const reload = useCallback(async () => {
    try {
      const [o, r] = await Promise.all([
        fetch(`/api/collection/${vnId}/owned-releases`, { cache: 'no-store' }).then((x) => x.json()),
        fetch(`/api/vn/${vnId}/releases`).then((x) => x.json()),
      ]);
      setOwned((o.owned ?? []) as OwnedEdition[]);
      setReleases((r.releases ?? []) as VndbRelease[]);
    } catch {
      // ignore — section is optional
    }
  }, [vnId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    reload().finally(() => alive && setLoading(false));
    fetch('/api/places').then((r) => r.json()).then((d) => alive && setKnownPlaces(d.places ?? [])).catch(() => {});
    return () => {
      alive = false;
    };
  }, [reload]);

  const releaseMap = useMemo(() => new Map(releases.map((r) => [r.id, r])), [releases]);
  const unownedReleases = useMemo(() => {
    const ownedSet = new Set(owned.map((o) => o.release_id));
    return releases.filter((r) => !ownedSet.has(r.id));
  }, [releases, owned]);

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
      toast.success(t.toast.saved);
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
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdition(releaseId: string, patch: Partial<OwnedEdition>) {
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
          disabled={busy || unownedReleases.length === 0}
          className="btn"
          title={t.inventory.addEdition}
        >
          <Plus className="h-4 w-4" /> {t.inventory.addEdition}
        </button>
      </header>

      {adderOpen && unownedReleases.length > 0 && (
        <div className="border-t border-border bg-bg-elev/30 px-4 py-3 sm:px-6">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-muted">
            {t.inventory.pickRelease}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {unownedReleases.slice(0, 30).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => addEdition(r.id)}
                disabled={busy}
                className="flex flex-col gap-1 rounded-md border border-border bg-bg-card p-2 text-left text-xs transition-colors hover:border-accent disabled:opacity-50"
              >
                <span className="line-clamp-2 font-semibold">{r.title}</span>
                <div className="flex flex-wrap gap-1 text-[10px] text-muted">
                  {r.released && <span className="tabular-nums">{r.released}</span>}
                  {r.platforms.slice(0, 3).map((p) => (
                    <span key={p}>{p}</span>
                  ))}
                  {r.languages.slice(0, 4).map((l) => (
                    <LangFlag key={l.lang} lang={l.lang} className="text-xs" />
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
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
            const isEditing = editingId === edition.release_id;
            return (
              <li key={edition.release_id} className="px-4 py-4 sm:px-6">
                <div className="flex gap-4">
                  <div className="w-24 shrink-0">
                    <SafeImage
                      src={cover?.url ?? null}
                      sexual={cover?.sexual ?? null}
                      alt={release?.title ?? edition.release_id}
                      className="aspect-[2/3] w-full rounded-md border border-border"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/release/${edition.release_id}`}
                          className="line-clamp-2 text-sm font-bold hover:text-accent"
                        >
                          {release?.title ?? edition.release_id}
                        </Link>
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
                        <Link
                          href={`/release/${edition.release_id}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-bg-elev hover:text-white"
                          title={t.releases.viewDetails}
                        >
                          <Info className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setEditingId(isEditing ? null : edition.release_id)}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded ${
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
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-status-dropped/10 hover:text-status-dropped"
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

  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-3">
      {edition.edition_label && (
        <Field icon={<Sparkles className="h-3 w-3" />} label={t.form.editionLabel} value={edition.edition_label} />
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
        <Field icon={<HardDriveDownload className="h-3 w-3" />} label={t.form.dumped} value="✓" valueClassName="text-accent" />
      )}
      {edition.physical_location.length > 0 && (
        <div className="col-span-2 sm:col-span-3">
          <div className="mb-0.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted">
            <MapPin className="h-3 w-3" />
            {t.form.physicalLocation}
          </div>
          <div className="flex flex-wrap gap-1">
            {edition.physical_location.map((p) => (
              <span key={p} className="rounded border border-border bg-bg-elev/60 px-1.5 py-0.5 text-[10px]">
                {p}
              </span>
            ))}
          </div>
        </div>
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
  onSave: (patch: Partial<OwnedEdition>) => void;
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

  function submit() {
    const price = pricePaid.trim() === '' ? null : Number(pricePaid);
    if (price !== null && (Number.isNaN(price) || price < 0)) return;
    onSave({
      edition_label: editionLabel.trim() || null,
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
          min={0}
          step="0.01"
          value={pricePaid}
          onChange={(e) => setPricePaid(e.target.value)}
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

