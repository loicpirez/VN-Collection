'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Bookmark, Plus, Save, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { StatusIcon } from './StatusIcon';
import { MarkdownNotes } from './MarkdownNotes';
import { DateInput } from './DateInput';
import { TagInput } from './TagInput';
import { EDITION_TYPES, LOCATIONS, STATUSES, type EditionType, type Location, type Status } from '@/lib/types';
import type { CollectionItem, SeriesRow } from '@/lib/types';

interface Props {
  vn: CollectionItem;
  inCollection: boolean;
  allSeries: SeriesRow[];
}

export function EditForm({ vn, inCollection, allSeries }: Props) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<Status>((vn.status as Status) ?? 'planning');
  const [userRating, setUserRating] = useState<string>(vn.user_rating != null ? String(vn.user_rating) : '');
  const [playtime, setPlaytime] = useState<string>(String(vn.playtime_minutes ?? 0));
  const [started, setStarted] = useState<string>(vn.started_date ?? '');
  const [finished, setFinished] = useState<string>(vn.finished_date ?? '');
  const [notes, setNotes] = useState<string>(vn.notes ?? '');
  const [favorite, setFavorite] = useState<boolean>(!!vn.favorite);
  const [location, setLocation] = useState<Location>((vn.location as Location) ?? 'unknown');
  const [editionType, setEditionType] = useState<EditionType>((vn.edition_type as EditionType) ?? 'none');
  const [editionLabel, setEditionLabel] = useState<string>(vn.edition_label ?? '');
  const [physicalLocations, setPhysicalLocations] = useState<string[]>(vn.physical_location ?? []);
  const [knownPlaces, setKnownPlaces] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/places').then((r) => r.json()).then((d) => setKnownPlaces(d.places ?? [])).catch(() => {});
  }, []);

  const [seriesPickerId, setSeriesPickerId] = useState<string>('');
  const myseries = vn.series ?? [];

  async function call(method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
    setError(null);
    const res = await fetch(`/api/collection/${vn.id}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || t.common.error);
    }
    return res.json();
  }

  function withTransition(fn: () => Promise<unknown>, after?: () => void) {
    startTransition(() => {
      fn()
        .then(() => {
          router.refresh();
          after?.();
        })
        .catch((e: Error) => setError(e.message));
    });
  }

  function handleAdd() {
    withTransition(() => call('POST', { status: 'planning' }));
  }

  function handleSave() {
    const ur = userRating === '' ? null : Number(userRating);
    if (ur !== null && (Number.isNaN(ur) || ur < 10 || ur > 100)) {
      setError(t.form.errors.ratingRange);
      return;
    }
    const pt = Number(playtime);
    if (Number.isNaN(pt) || pt < 0) {
      setError(t.form.errors.playtimeInvalid);
      return;
    }
    withTransition(() =>
      call('PATCH', {
        status,
        user_rating: ur,
        playtime_minutes: pt,
        started_date: started || null,
        finished_date: finished || null,
        notes: notes || null,
        favorite,
        location,
        edition_type: editionType,
        edition_label: editionLabel || null,
        physical_location: physicalLocations,
      }),
    );
  }

  function handleRemove() {
    if (!confirm(t.form.removeConfirm)) return;
    withTransition(
      () => call('DELETE'),
      () => router.push('/'),
    );
  }

  async function addSeries(seriesId: number) {
    setError(null);
    try {
      const res = await fetch(`/api/series/${seriesId}/vn/${vn.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t.common.error);
      setSeriesPickerId('');
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeSeries(seriesId: number) {
    await fetch(`/api/series/${seriesId}/vn/${vn.id}`, { method: 'DELETE' });
    startTransition(() => router.refresh());
  }

  if (!inCollection) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-6">
        <p className="mb-4 text-muted">{t.form.notInCollection}</p>
        <button className="btn btn-primary" onClick={handleAdd} disabled={pending}>
          <Plus className="h-4 w-4" />
          {pending ? t.form.adding : t.form.add}
        </button>
        {error && <p className="mt-3 text-sm text-status-dropped">{error}</p>}
      </div>
    );
  }

  const seriesNotIn = allSeries.filter((s) => !myseries.some((ms) => ms.id === s.id));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-bg-card p-6">
        <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted">{t.form.myTracking}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="label">{t.form.status}</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                <StatusIcon status={status} className="h-4 w-4" />
              </span>
              <select className="input pl-9" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{t.status[s]}</option>
                ))}
              </select>
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="label">{t.form.myRating}</span>
            <input
              className="input"
              type="number"
              min={10}
              max={100}
              step={1}
              value={userRating}
              onChange={(e) => setUserRating(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="label">{t.form.playtimeMinutes}</span>
            <input className="input" type="number" min={0} step={1} value={playtime} onChange={(e) => setPlaytime(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="label">{t.form.favorite}</span>
            <select className="input" value={favorite ? '1' : '0'} onChange={(e) => setFavorite(e.target.value === '1')}>
              <option value="0">{t.common.no}</option>
              <option value="1">{t.form.favoriteYes}</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="label">{t.form.startedDate}</span>
            <DateInput value={started} onChange={setStarted} ariaLabel={t.form.startedDate} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="label">{t.form.finishedDate}</span>
            <DateInput value={finished} onChange={setFinished} ariaLabel={t.form.finishedDate} />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-bg-card p-6">
        <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted">{t.form.inventoryTitle}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="label">{t.form.location}</span>
            <select className="input" value={location} onChange={(e) => setLocation(e.target.value as Location)}>
              {LOCATIONS.map((l) => (
                <option key={l} value={l}>{t.locations[l]}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">{t.form.editionType}</span>
            <select className="input" value={editionType} onChange={(e) => setEditionType(e.target.value as EditionType)}>
              {EDITION_TYPES.map((e) => (
                <option key={e} value={e}>{t.editions[e]}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="label">{t.form.editionLabel}</span>
            <input
              className="input"
              type="text"
              placeholder={t.form.editionLabelPlaceholder}
              value={editionLabel}
              onChange={(e) => setEditionLabel(e.target.value)}
            />
          </label>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <span className="label">{t.form.physicalLocation}</span>
            <TagInput
              values={physicalLocations}
              onChange={setPhysicalLocations}
              placeholder={t.form.physicalLocationPlaceholder}
              suggestions={knownPlaces}
              maxLength={200}
              maxValues={32}
            />
            <span className="text-[10px] text-muted/70">{t.form.physicalLocationHint}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-bg-card p-6">
        <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted">{t.form.personalNotes}</h3>
        <MarkdownNotes value={notes} onChange={setNotes} />
      </div>

      <div className="rounded-xl border border-border bg-bg-card p-6">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
          <Bookmark className="h-4 w-4" /> {t.detail.seriesSection}
        </h3>
        {myseries.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {myseries.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elev px-3 py-1 text-xs">
                <Link href={`/series/${s.id}`} className="hover:text-accent">{s.name}</Link>
                <button
                  type="button"
                  className="text-muted hover:text-status-dropped"
                  onClick={() => removeSeries(s.id)}
                  aria-label={t.series.removeFromSeries}
                >×</button>
              </span>
            ))}
          </div>
        )}
        {seriesNotIn.length > 0 && (
          <div className="flex gap-2">
            <select className="input flex-1" value={seriesPickerId} onChange={(e) => setSeriesPickerId(e.target.value)}>
              <option value="">{t.detail.addToSeries}</option>
              {seriesNotIn.map((s) => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!seriesPickerId}
              onClick={() => seriesPickerId && addSeries(Number(seriesPickerId))}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
        {allSeries.length === 0 && (
          <p className="text-xs text-muted">
            <Link href="/series" className="hover:text-accent">{t.series.pageTitle} →</Link>
          </p>
        )}
      </div>

      {error && <p className="text-sm text-status-dropped">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={handleSave} disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? t.form.saving : t.form.save}
        </button>
        <button className="btn btn-danger" onClick={handleRemove} disabled={pending}>
          <Trash2 className="h-4 w-4" />
          {t.form.remove}
        </button>
      </div>
    </div>
  );
}
