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

type SaveField = 'status' | 'favorite' | 'dumped';

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
  const [pendingFields, setPendingFields] = useState<ReadonlySet<SaveField>>(() => new Set<SaveField>());
  const [addingSeries, setAddingSeries] = useState(false);
  const [removingSeriesId, setRemovingSeriesId] = useState<number | null>(null);
  const [removingItem, setRemovingItem] = useState(false);
  const myseries = useMemo(() => vn.series ?? [], [vn.series]);

  const markPending = useCallback((field: SaveField) => {
    setPendingFields((prev) => {
      if (prev.has(field)) return prev;
      const next = new Set<SaveField>(prev);
      next.add(field);
      return next;
    });
  }, []);

  const handleStatusChange = useCallback((next: Status) => {
    markPending('status');
    setStatus(next);
  }, [markPending]);

  const handleFavoriteChange = useCallback((next: boolean) => {
    markPending('favorite');
    setFavorite(next);
  }, [markPending]);

  const handleDumpedChange = useCallback((next: boolean) => {
    markPending('dumped');
    setDumped(next);
  }, [markPending]);

  const buildPayload = useCallback((override?: Partial<{
    status: Status;
    userRating: string;
    playtime: string;
    started: string;
    finished: string;
    favorite: boolean;
    dumped: boolean;
  }>) => {
    const s = override?.status ?? status;
    const ur = override?.userRating ?? userRating;
    const pt = override?.playtime ?? playtime;
    const sd = override?.started ?? started;
    const fd = override?.finished ?? finished;
    const fav = override?.favorite ?? favorite;
    const dmp = override?.dumped ?? dumped;
    return {
      status: s,
      user_rating: ur === '' ? null : Number(ur),
      playtime_minutes: Number(pt),
      started_date: sd || null,
      finished_date: fd || null,
      notes: notes || null,
      favorite: fav,
      location,
      edition_type: editionType,
      edition_label: editionLabel || null,
      physical_location: physicalLocations,
      box_type: boxType,
      download_url: downloadUrl.trim() || null,
      dumped: dmp,
    };
  }, [status, userRating, playtime, started, finished, notes, favorite, location, editionType, editionLabel, physicalLocations, boxType, downloadUrl, dumped]);

  const lastSavedRef = useRef<string | null>(null);
  const prevDumpedRef = useRef<boolean>(!!vn.dumped);
  const prevFavoriteRef = useRef<boolean>(!!vn.favorite);
  const mountedRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const seededRef = useRef({
    status: (vn.status as Status) ?? 'planning',
    userRating: vn.user_rating != null ? String(vn.user_rating) : '',
    playtime: String(vn.playtime_minutes ?? 0),
    started: vn.started_date ?? '',
    finished: vn.finished_date ?? '',
    favorite: !!vn.favorite,
    dumped: !!vn.dumped,
  });

  const pendingCommitRef = useRef<(() => void) | null>(null);

  /**
   * Re-sync server-owned fields from the incoming `vn` prop when a sibling
   * surface (SmartStatusHint, PomodoroTimer, FavoriteToggleButton, game-log
   * sessions, …) mutates them and `router.refresh()` delivers a fresh prop.
   * Each field is re-seeded only when its prop value changed since the last
   * seed AND the local state still matches that prior seed (i.e. the user has
   * no unsaved edit in flight); a dirty field keeps the user's value. After
   * re-seeding, `lastSavedRef` is re-primed to the payload the committed state
   * will produce so the debounced auto-save does not PATCH the server value
   * straight back, and `prevDumpedRef` follows the server `dumped` so no
   * spurious dumped toast fires.
   */
  useEffect(() => {
    const incoming = {
      status: (vn.status as Status) ?? 'planning',
      userRating: vn.user_rating != null ? String(vn.user_rating) : '',
      playtime: String(vn.playtime_minutes ?? 0),
      started: vn.started_date ?? '',
      finished: vn.finished_date ?? '',
      favorite: !!vn.favorite,
      dumped: !!vn.dumped,
    };
    const seeded = seededRef.current;
    const next = { status, userRating, playtime, started, finished, favorite, dumped };
    let reseeded = false;
    if (incoming.status !== seeded.status) {
      if (status === seeded.status) { setStatus(incoming.status); next.status = incoming.status; reseeded = true; }
      seeded.status = incoming.status;
    }
    if (incoming.userRating !== seeded.userRating) {
      if (userRating === seeded.userRating) { setUserRating(incoming.userRating); next.userRating = incoming.userRating; reseeded = true; }
      seeded.userRating = incoming.userRating;
    }
    if (incoming.playtime !== seeded.playtime) {
      if (playtime === seeded.playtime) { setPlaytime(incoming.playtime); next.playtime = incoming.playtime; reseeded = true; }
      seeded.playtime = incoming.playtime;
    }
    if (incoming.started !== seeded.started) {
      if (started === seeded.started) { setStarted(incoming.started); next.started = incoming.started; reseeded = true; }
      seeded.started = incoming.started;
    }
    if (incoming.finished !== seeded.finished) {
      if (finished === seeded.finished) { setFinished(incoming.finished); next.finished = incoming.finished; reseeded = true; }
      seeded.finished = incoming.finished;
    }
    if (incoming.favorite !== seeded.favorite) {
      if (favorite === seeded.favorite) { setFavorite(incoming.favorite); next.favorite = incoming.favorite; reseeded = true; }
      seeded.favorite = incoming.favorite;
      prevFavoriteRef.current = next.favorite;
    }
    if (incoming.dumped !== seeded.dumped) {
      if (dumped === seeded.dumped) { setDumped(incoming.dumped); next.dumped = incoming.dumped; reseeded = true; }
      seeded.dumped = incoming.dumped;
      prevDumpedRef.current = next.dumped;
    }
    if (reseeded) {
      lastSavedRef.current = JSON.stringify(buildPayload(next));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vn.status, vn.user_rating, vn.playtime_minutes, vn.started_date, vn.finished_date, vn.favorite, vn.dumped]);

  /**
   * Flush a pending debounced save when the VN identity changes underneath the
   * form, so the last edit for the previous VN is not dropped on navigation.
   */
  useEffect(() => () => {
    pendingCommitRef.current?.();
  }, [vn.id]);

  useEffect(() => () => {
    unmountedRef.current = true;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    pendingCommitRef.current?.();
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      lastSavedRef.current = JSON.stringify(buildPayload());
      return;
    }
    if (!inCollection) return;
    if (userRatingInvalid || playtimeInvalid) {
      setPendingFields((prev) => (prev.size ? new Set<SaveField>() : prev));
      return;
    }
    const payload = buildPayload();
    const serialized = JSON.stringify(payload);
    if (serialized === lastSavedRef.current) {
      setPendingFields((prev) => (prev.size ? new Set<SaveField>() : prev));
      return;
    }
    const dumpedJustEnabled = dumped && !prevDumpedRef.current;
    const favoriteChanged = favorite !== prevFavoriteRef.current;
    setSaveStatus('saving');
    const commit = () => {
      pendingCommitRef.current = null;
      call('PATCH', payload)
        .then(() => {
          lastSavedRef.current = serialized;
          prevDumpedRef.current = dumped;
          prevFavoriteRef.current = favorite;
          if (unmountedRef.current) return;
          setPendingFields(new Set<SaveField>());
          if (dumpedJustEnabled) toast.success(t.toast.markedDumped);
          if (favoriteChanged) toast.success(favorite ? t.toast.favoriteAdded : t.toast.favoriteRemoved);
          if (!dumpedJustEnabled && !favoriteChanged) toast.success(t.toast.saved);
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
          setPendingFields(new Set<SaveField>());
          setSaveStatus('idle');
          setError(e.message);
          toast.error(e.message);
        });
    };
    const timer = setTimeout(commit, 800);
    pendingCommitRef.current = () => {
      clearTimeout(timer);
      commit();
    };
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

  const trackingSaving = pendingFields.has('status') || pendingFields.has('favorite');
  const dumpedSaving = pendingFields.has('dumped');

  async function handleRemove() {
    const ok = await confirm({ message: t.form.removeConfirm, tone: 'danger' });
    if (!ok) return;
    setRemovingItem(true);
    withTransition(
      () => call('DELETE')
        .then(() => toast.success(t.toast.removed))
        .catch((e: Error) => {
          if (!unmountedRef.current) setRemovingItem(false);
          throw e;
        }),
      () => router.push('/'),
    );
  }

  async function addSeries(seriesId: number) {
    setError(null);
    setAddingSeries(true);
    try {
      const res = await fetch(`/api/series/${seriesId}/vn/${vn.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!res.ok) throw new Error(await readApiError(res, t.common.error));
      setSeriesPickerId('');
      toast.success(t.seriesAutoSuggest.added);
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      if (!unmountedRef.current) setAddingSeries(false);
    }
  }

  async function removeSeries(seriesId: number) {
    setError(null);
    setRemovingSeriesId(seriesId);
    try {
      const res = await fetch(`/api/series/${seriesId}/vn/${vn.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readApiError(res, t.common.error));
      toast.success(t.toast.removedFromSeries);
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      if (!unmountedRef.current) setRemovingSeriesId(null);
    }
  }

  if (!inCollection) {
    return (
      <div className="p-4 sm:p-6">
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
    <div className="space-y-6 p-4 sm:p-6">
      <div className="relative" aria-busy={trackingSaving || undefined}>
        {trackingSaving && (
          <span
            role="status"
            aria-label={t.form.saving}
            title={t.form.saving}
            className="pointer-events-none absolute right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-bg-card/90 text-accent shadow-card backdrop-blur"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          </span>
        )}
        <TrackingFields
          status={status}
          onStatusChange={handleStatusChange}
          userRating={userRating}
          userRatingInvalid={userRatingInvalid}
          onUserRatingChange={setUserRating}
          playtime={playtime}
          playtimeInvalid={playtimeInvalid}
          onPlaytimeChange={setPlaytime}
          favorite={favorite}
          onFavoriteChange={handleFavoriteChange}
          started={started}
          onStartedChange={setStarted}
          finished={finished}
          onFinishedChange={setFinished}
        />
      </div>

      <div className="relative" aria-busy={dumpedSaving || undefined}>
        {dumpedSaving && (
          <span
            role="status"
            aria-label={t.form.saving}
            title={t.form.saving}
            className="pointer-events-none absolute bottom-3 right-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-bg-card/90 text-accent shadow-card backdrop-blur"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          </span>
        )}
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
          onDumpedChange={handleDumpedChange}
        />
      </div>

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
                  className="inline-flex items-center text-muted hover:text-status-dropped disabled:cursor-wait disabled:opacity-60"
                  onClick={() => removeSeries(s.id)}
                  disabled={removingSeriesId === s.id}
                  aria-busy={removingSeriesId === s.id || undefined}
                  aria-label={t.series.removeFromSeries}
                >
                  {removingSeriesId === s.id
                    ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    : <span aria-hidden>×</span>}
                </button>
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
              className="btn btn-primary disabled:cursor-wait"
              disabled={!seriesPickerId || addingSeries}
              onClick={() => seriesPickerId && addSeries(Number(seriesPickerId))}
              aria-busy={addingSeries || undefined}
              aria-label={t.detail.addToSeries}
            >
              {addingSeries
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                : <Plus className="h-4 w-4" aria-hidden />}
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
          disabled={pending || removingItem}
          aria-busy={removingItem || undefined}
          className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-status-dropped disabled:opacity-40 disabled:hover:text-muted"
        >
          {removingItem
            ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            : <Trash2 className="h-3 w-3" aria-hidden />}
          {t.form.remove}
        </button>
      </div>
    </div>
  );
}
