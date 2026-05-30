'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Bookmark, Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import { TrackingFields } from './edit-form/TrackingFields';
import { OwnedEditions } from './edit-form/OwnedEditions';
import { NotesEditor } from './edit-form/NotesEditor';
import type { BoxType, EditionType, Location, Status } from '@/lib/types';
import type { CollectionItem, SeriesRow } from '@/lib/types';

import { readApiError } from '@/lib/api-error-read';
interface Props {
  vn: CollectionItem;
  inCollection: boolean;
  allSeries: SeriesRow[];
}

export function EditForm({ vn, inCollection, allSeries }: Props) {
  const t = useT();
  const toast = useToast();
  const { confirm } = useConfirm();
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
  const [boxType, setBoxType] = useState<BoxType>((vn.box_type as BoxType) ?? 'none');
  const [downloadUrl, setDownloadUrl] = useState<string>(vn.download_url ?? '');
  const [dumped, setDumped] = useState<boolean>(!!vn.dumped);
  const [knownPlaces, setKnownPlaces] = useState<string[]>([]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/places', { signal: ctrl.signal, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (ctrl.signal.aborted) return;
        setKnownPlaces(d.places ?? []);
      })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        console.error('[EditForm] places fetch failed:', e);
      });
    return () => ctrl.abort();
  }, []);

  const [seriesPickerId, setSeriesPickerId] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const myseries = useMemo(() => vn.series ?? [], [vn.series]);

  const buildPayload = useCallback(() => ({
    status,
    user_rating: userRating === '' ? null : Number(userRating),
    playtime_minutes: Number(playtime),
    started_date: started || null,
    finished_date: finished || null,
    notes: notes || null,
    favorite,
    location,
    edition_type: editionType,
    edition_label: editionLabel || null,
    physical_location: physicalLocations,
    box_type: boxType,
    download_url: downloadUrl.trim() || null,
    dumped,
  }), [status, userRating, playtime, started, finished, notes, favorite, location, editionType, editionLabel, physicalLocations, boxType, downloadUrl, dumped]);

  const lastSavedRef = useRef<string | null>(null);
  const prevDumpedRef = useRef<boolean>(!!vn.dumped);
  const mountedRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  useEffect(() => () => {
    unmountedRef.current = true;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      lastSavedRef.current = JSON.stringify(buildPayload());
      return;
    }
    if (!inCollection) return;
    if (userRatingInvalid || playtimeInvalid) return;
    const payload = buildPayload();
    const serialized = JSON.stringify(payload);
    if (serialized === lastSavedRef.current) return;
    const dumpedJustEnabled = dumped && !prevDumpedRef.current;
    setSaveStatus('saving');
    const timer = setTimeout(() => {
      lastSavedRef.current = serialized;
      call('PATCH', payload)
        .then(() => {
          prevDumpedRef.current = dumped;
          if (unmountedRef.current) return;
          if (dumpedJustEnabled) toast.success(t.toast.markedDumped);
          setSaveStatus('saved');
          startTransition(() => router.refresh());
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          idleTimerRef.current = setTimeout(() => {
            if (unmountedRef.current) return;
            setSaveStatus('idle');
          }, 2000);
        })
        .catch((e: Error) => {
          if (unmountedRef.current) return;
          setSaveStatus('idle');
          setError(e.message);
          toast.error(e.message);
        });
    }, 800);
    return () => {
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userRating, playtime, started, finished, notes, favorite, location, editionType, editionLabel, physicalLocations, boxType, downloadUrl, dumped]);

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
        .catch((e: Error) => {
          setError(e.message);
          toast.error(e.message);
        });
    });
  }

  function handleAdd() {
    withTransition(
      () => call('POST', { status: 'planning' }).then(() => toast.success(t.toast.added)),
    );
  }

  // Derived field-level validity so the offending input can carry
  // aria-invalid and a red ring at edit-time, not just at save-time.
  const userRatingNum = userRating === '' ? null : Number(userRating);
  const userRatingInvalid =
    userRatingNum !== null && (Number.isNaN(userRatingNum) || userRatingNum < 10 || userRatingNum > 100);
  const playtimeNum = Number(playtime);
  const playtimeInvalid = Number.isNaN(playtimeNum) || playtimeNum < 0;

  async function handleRemove() {
    const ok = await confirm({ message: t.form.removeConfirm, tone: 'danger' });
    if (!ok) return;
    withTransition(
      () => call('DELETE').then(() => toast.success(t.toast.removed)),
      () => router.push('/'),
    );
  }

  async function addSeries(seriesId: number) {
    setError(null);
    try {
      const res = await fetch(`/api/series/${seriesId}/vn/${vn.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!res.ok) throw new Error(await readApiError(res, t.common.error));
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
      <div className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
        <p className="mb-4 text-muted">{t.form.notInCollection}</p>
        <button type="button" className="btn btn-primary" onClick={handleAdd} disabled={pending}>
          <Plus className="h-4 w-4" />
          {pending ? t.form.adding : t.form.add}
        </button>
        {error && <p role="alert" className="mt-3 text-sm text-status-dropped">{error}</p>}
      </div>
    );
  }

  const seriesNotIn = allSeries.filter((s) => !myseries.some((ms) => ms.id === s.id));

  return (
    <div className="space-y-6">
      <TrackingFields
        status={status}
        onStatusChange={setStatus}
        userRating={userRating}
        userRatingInvalid={userRatingInvalid}
        onUserRatingChange={setUserRating}
        playtime={playtime}
        playtimeInvalid={playtimeInvalid}
        onPlaytimeChange={setPlaytime}
        favorite={favorite}
        onFavoriteChange={setFavorite}
        started={started}
        onStartedChange={setStarted}
        finished={finished}
        onFinishedChange={setFinished}
      />

      <OwnedEditions
        location={location}
        onLocationChange={setLocation}
        editionType={editionType}
        onEditionTypeChange={setEditionType}
        boxType={boxType}
        onBoxTypeChange={setBoxType}
        editionLabel={editionLabel}
        onEditionLabelChange={setEditionLabel}
        physicalLocations={physicalLocations}
        onPhysicalLocationsChange={setPhysicalLocations}
        knownPlaces={knownPlaces}
        downloadUrl={downloadUrl}
        onDownloadUrlChange={setDownloadUrl}
        dumped={dumped}
        onDumpedChange={setDumped}
      />

      <NotesEditor notes={notes} onNotesChange={setNotes} />

      <div className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
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
            <select
              className="input flex-1"
              value={seriesPickerId}
              onChange={(e) => setSeriesPickerId(e.target.value)}
              aria-label={t.detail.addToSeries}
            >
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
              aria-label={t.detail.addToSeries}
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
        {allSeries.length === 0 && (
          <p className="text-xs text-muted">
            <Link href="/series" className="inline-flex items-center gap-1 hover:text-accent">
              {t.series.pageTitle}
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </p>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-status-dropped">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-bg-card px-4 py-2.5">
        <span
          aria-live="polite"
          aria-atomic="true"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted"
        >
          {saveStatus === 'saving' && (
            <><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {t.form.saving}</>
          )}
          {saveStatus === 'saved' && (
            <><Check className="h-3 w-3 text-status-completed" aria-hidden />
              <span className="text-status-completed">{t.toast.saved}</span>
            </>
          )}
          {saveStatus === 'idle' && (
            <span className="opacity-50">{t.form.autoSaveHint ?? t.form.save}</span>
          )}
        </span>
        <button
          type="button"
          onClick={handleRemove}
          disabled={pending}
          className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-status-dropped disabled:opacity-40"
        >
          <Trash2 className="h-3 w-3" aria-hidden />
          {t.form.remove}
        </button>
      </div>
    </div>
  );
}
