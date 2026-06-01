'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Bookmark, Check, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import { TrackingFields } from './edit-form/TrackingFields';
import { OwnedEditions } from './edit-form/OwnedEditions';
import { NotesEditor } from './edit-form/NotesEditor';
import type { BoxType, EditionType, Location, Status } from '@/lib/types';
import type { CollectionItem, SeriesRow } from '@/lib/types';

import { readApiError } from '@/lib/api-error-read';
import { decodeKnownPlacesResponse } from '@/lib/place-client-shape';

type SaveField = 'status' | 'favorite' | 'dumped' | 'dumped_ignored';

interface Props {
  vn: CollectionItem;
  inCollection: boolean;
  allSeries: SeriesRow[];
}

interface FormSeed {
  status: Status;
  userRating: string;
  playtime: string;
  started: string;
  finished: string;
  notes: string;
  favorite: boolean;
  location: Location;
  editionType: EditionType;
  editionLabel: string;
  physicalLocations: string[];
  boxType: BoxType;
  downloadUrl: string;
  dumped: boolean;
  dumpedIgnored: boolean;
}

function formSeed(vn: CollectionItem): FormSeed {
  return {
    status: (vn.status as Status) ?? 'planning',
    userRating: vn.user_rating != null ? String(vn.user_rating) : '',
    playtime: String(vn.playtime_minutes ?? 0),
    started: vn.started_date ?? '',
    finished: vn.finished_date ?? '',
    notes: vn.notes ?? '',
    favorite: !!vn.favorite,
    location: (vn.location as Location) ?? 'unknown',
    editionType: (vn.edition_type as EditionType) ?? 'none',
    editionLabel: vn.edition_label ?? '',
    physicalLocations: [...(vn.physical_location ?? [])],
    boxType: (vn.box_type as BoxType) ?? 'none',
    downloadUrl: vn.download_url ?? '',
    dumped: !!vn.dumped,
    dumpedIgnored: !!vn.dumped_ignored,
  };
}

function payloadFromSeed(seed: FormSeed) {
  return {
    status: seed.status,
    user_rating: seed.userRating === '' ? null : Number(seed.userRating),
    playtime_minutes: Number(seed.playtime),
    started_date: seed.started || null,
    finished_date: seed.finished || null,
    notes: seed.notes || null,
    favorite: seed.favorite,
    location: seed.location,
    edition_type: seed.editionType,
    edition_label: seed.editionLabel || null,
    physical_location: seed.physicalLocations,
    box_type: seed.boxType,
    download_url: seed.downloadUrl.trim() || null,
    dumped: seed.dumped,
    dumped_ignored: seed.dumpedIgnored,
  };
}

export function EditForm({ vn, inCollection, allSeries }: Props) {
  const t = useT();
  const toast = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const initial = formSeed(vn);

  const [status, setStatus] = useState<Status>(initial.status);
  const [userRating, setUserRating] = useState<string>(initial.userRating);
  const [playtime, setPlaytime] = useState<string>(initial.playtime);
  const [started, setStarted] = useState<string>(initial.started);
  const [finished, setFinished] = useState<string>(initial.finished);
  const [notes, setNotes] = useState<string>(initial.notes);
  const [favorite, setFavorite] = useState<boolean>(initial.favorite);
  const [location, setLocation] = useState<Location>(initial.location);
  const [editionType, setEditionType] = useState<EditionType>(initial.editionType);
  const [editionLabel, setEditionLabel] = useState<string>(initial.editionLabel);
  const [physicalLocations, setPhysicalLocations] = useState<string[]>(initial.physicalLocations);
  const [boxType, setBoxType] = useState<BoxType>(initial.boxType);
  const [downloadUrl, setDownloadUrl] = useState<string>(initial.downloadUrl);
  const [dumped, setDumped] = useState<boolean>(initial.dumped);
  const [dumpedIgnored, setDumpedIgnored] = useState<boolean>(initial.dumpedIgnored);
  const [knownPlaces, setKnownPlaces] = useState<string[]>([]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/places', { signal: ctrl.signal, cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        return r.json();
      })
      .then((d) => {
        if (ctrl.signal.aborted) return;
        setKnownPlaces(decodeKnownPlacesResponse(d) ?? []);
      })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        console.error('[EditForm] places fetch failed:', e);
      });
    return () => ctrl.abort();
  }, [t.common.error]);

  const [seriesPickerId, setSeriesPickerId] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [pendingFields, setPendingFields] = useState<ReadonlySet<SaveField>>(() => new Set<SaveField>());
  const [addingSeries, setAddingSeries] = useState(false);
  const [removingSeriesId, setRemovingSeriesId] = useState<number | null>(null);
  const [addingItem, setAddingItem] = useState(false);
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

  const handleDumpedIgnoredChange = useCallback((next: boolean) => {
    markPending('dumped_ignored');
    setDumpedIgnored(next);
  }, [markPending]);

  const buildPayload = useCallback((override?: Partial<{
    status: Status;
    userRating: string;
    playtime: string;
    started: string;
    finished: string;
    favorite: boolean;
    dumped: boolean;
    dumpedIgnored: boolean;
  }>) => {
    const s = override?.status ?? status;
    const ur = override?.userRating ?? userRating;
    const pt = override?.playtime ?? playtime;
    const sd = override?.started ?? started;
    const fd = override?.finished ?? finished;
    const fav = override?.favorite ?? favorite;
    const dmp = override?.dumped ?? dumped;
    const dmpIgnored = override?.dumpedIgnored ?? dumpedIgnored;
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
      dumped_ignored: dmpIgnored,
    };
  }, [status, userRating, playtime, started, finished, notes, favorite, location, editionType, editionLabel, physicalLocations, boxType, downloadUrl, dumped, dumpedIgnored]);

  const lastSavedRef = useRef<string | null>(null);
  const prevDumpedRef = useRef<boolean>(!!vn.dumped);
  const prevFavoriteRef = useRef<boolean>(!!vn.favorite);
  const mountedRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const seededRef = useRef({
    status: (vn.status as Status) ?? 'planning',
    userRating: vn.user_rating != null ? String(vn.user_rating) : '',
    playtime: String(vn.playtime_minutes ?? 0),
    started: vn.started_date ?? '',
    finished: vn.finished_date ?? '',
    favorite: !!vn.favorite,
    dumped: !!vn.dumped,
    dumpedIgnored: !!vn.dumped_ignored,
  });

  const pendingCommitRef = useRef<(() => void) | null>(null);
  const identityRef = useRef<string | null>(vn.id);
  const skipAutoSaveRef = useRef(false);
  const collectionAbortRef = useRef<AbortController | null>(null);
  const collectionMutationKindRef = useRef<'autosave' | 'action' | null>(null);
  const seriesAbortRef = useRef<AbortController | null>(null);

  function beginAutosave(ownerVnId: string): AbortController | null {
    if (identityRef.current !== ownerVnId || collectionMutationKindRef.current === 'action') return null;
    collectionAbortRef.current?.abort();
    const controller = new AbortController();
    collectionAbortRef.current = controller;
    collectionMutationKindRef.current = 'autosave';
    return controller;
  }

  function beginCollectionAction(ownerVnId: string): AbortController | null {
    if (identityRef.current !== ownerVnId || collectionMutationKindRef.current === 'action') return null;
    collectionAbortRef.current?.abort();
    const controller = new AbortController();
    collectionAbortRef.current = controller;
    collectionMutationKindRef.current = 'action';
    return controller;
  }

  function ownsCollectionMutation(ownerVnId: string, controller: AbortController): boolean {
    return identityRef.current === ownerVnId
      && collectionAbortRef.current === controller
      && !controller.signal.aborted;
  }

  function finishCollectionMutation(controller: AbortController) {
    if (collectionAbortRef.current !== controller) return;
    collectionAbortRef.current = null;
    collectionMutationKindRef.current = null;
  }

  function clearPendingAutosave() {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
    pendingCommitRef.current = null;
  }

  function beginSeriesMutation(ownerVnId: string): AbortController | null {
    if (identityRef.current !== ownerVnId || seriesAbortRef.current) return null;
    const controller = new AbortController();
    seriesAbortRef.current = controller;
    return controller;
  }

  function ownsSeriesMutation(ownerVnId: string, controller: AbortController): boolean {
    return identityRef.current === ownerVnId
      && seriesAbortRef.current === controller
      && !controller.signal.aborted;
  }

  function finishSeriesMutation(controller: AbortController) {
    if (seriesAbortRef.current === controller) seriesAbortRef.current = null;
  }

  useEffect(() => {
    const next = formSeed(vn);
    identityRef.current = vn.id;
    skipAutoSaveRef.current = true;
    unmountedRef.current = false;
    setError(null);
    setStatus(next.status);
    setUserRating(next.userRating);
    setPlaytime(next.playtime);
    setStarted(next.started);
    setFinished(next.finished);
    setNotes(next.notes);
    setFavorite(next.favorite);
    setLocation(next.location);
    setEditionType(next.editionType);
    setEditionLabel(next.editionLabel);
    setPhysicalLocations(next.physicalLocations);
    setBoxType(next.boxType);
    setDownloadUrl(next.downloadUrl);
    setDumped(next.dumped);
    setDumpedIgnored(next.dumpedIgnored);
    setSeriesPickerId('');
    setSaveStatus('idle');
    setPendingFields(new Set<SaveField>());
    setAddingSeries(false);
    setRemovingSeriesId(null);
    setAddingItem(false);
    setRemovingItem(false);
    seededRef.current = {
      status: next.status,
      userRating: next.userRating,
      playtime: next.playtime,
      started: next.started,
      finished: next.finished,
      favorite: next.favorite,
      dumped: next.dumped,
      dumpedIgnored: next.dumpedIgnored,
    };
    lastSavedRef.current = JSON.stringify(payloadFromSeed(next));
    prevDumpedRef.current = next.dumped;
    prevFavoriteRef.current = next.favorite;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    return () => {
      identityRef.current = null;
      collectionAbortRef.current?.abort();
      collectionAbortRef.current = null;
      collectionMutationKindRef.current = null;
      seriesAbortRef.current?.abort();
      seriesAbortRef.current = null;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  // The complete form reset is intentionally identity-scoped. Same-VN
  // router refreshes use the selective reseed effect below to preserve drafts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vn.id]);

  /**
   * Re-sync server-owned fields from the incoming `vn` prop when a sibling
   * surface (SmartStatusHint, PomodoroTimer, FavoriteToggleButton, game-log
   * sessions, ...) mutates them and `router.refresh()` delivers a fresh prop.
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
      dumpedIgnored: !!vn.dumped_ignored,
    };
    const seeded = seededRef.current;
    const next = { status, userRating, playtime, started, finished, favorite, dumped, dumpedIgnored };
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
    if (incoming.dumpedIgnored !== seeded.dumpedIgnored) {
      if (dumpedIgnored === seeded.dumpedIgnored) { setDumpedIgnored(incoming.dumpedIgnored); next.dumpedIgnored = incoming.dumpedIgnored; reseeded = true; }
      seeded.dumpedIgnored = incoming.dumpedIgnored;
    }
    if (reseeded) {
      lastSavedRef.current = JSON.stringify(buildPayload(next));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vn.status, vn.user_rating, vn.playtime_minutes, vn.started_date, vn.finished_date, vn.favorite, vn.dumped, vn.dumped_ignored]);

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
      skipAutoSaveRef.current = false;
      return;
    }
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
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
    const ownerVnId = vn.id;
    setSaveStatus('saving');
    const commit = () => {
      autoSaveTimerRef.current = null;
      pendingCommitRef.current = null;
      const detached = unmountedRef.current || identityRef.current !== ownerVnId;
      const controller = detached ? null : beginAutosave(ownerVnId);
      if (!detached && !controller) return;
      call('PATCH', payload, {
        keepalive: detached,
        signal: controller?.signal,
      })
        .then(() => {
          if (controller && !ownsCollectionMutation(ownerVnId, controller)) return;
          if (identityRef.current !== ownerVnId) return;
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
          if (e.name === 'AbortError') return;
          if (controller && !ownsCollectionMutation(ownerVnId, controller)) return;
          if (unmountedRef.current || identityRef.current !== ownerVnId) return;
          setPendingFields(new Set<SaveField>());
          setSaveStatus('idle');
          setError(e.message);
          toast.error(e.message);
        })
        .finally(() => {
          if (controller) finishCollectionMutation(controller);
        });
    };
    const timer = setTimeout(commit, 800);
    autoSaveTimerRef.current = timer;
    pendingCommitRef.current = () => {
      clearTimeout(timer);
      commit();
    };
    return () => {
      clearTimeout(timer);
      if (autoSaveTimerRef.current === timer) autoSaveTimerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userRating, playtime, started, finished, notes, favorite, location, editionType, editionLabel, physicalLocations, boxType, downloadUrl, dumped, dumpedIgnored]);

  async function call(method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, options?: {
    keepalive?: boolean;
    signal?: AbortSignal;
  }) {
    const ownerVnId = vn.id;
    if (identityRef.current === ownerVnId) setError(null);
    const res = await fetch(`/api/collection/${vn.id}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      keepalive: options?.keepalive,
      signal: options?.signal,
    });
    if (!res.ok) throw new Error(await readApiError(res, t.common.error));
    return res.json();
  }

  function withCollectionTransition(
    ownerVnId: string,
    controller: AbortController,
    fn: () => Promise<unknown>,
    after?: () => void,
  ) {
    startTransition(() => {
      fn()
        .then(() => {
          if (!ownsCollectionMutation(ownerVnId, controller)) return;
          router.refresh();
          after?.();
        })
        .catch((e: Error) => {
          if (e.name === 'AbortError' || !ownsCollectionMutation(ownerVnId, controller)) return;
          setError(e.message);
          toast.error(e.message);
        })
        .finally(() => {
          if (!ownsCollectionMutation(ownerVnId, controller)) return;
          finishCollectionMutation(controller);
          setAddingItem(false);
          setRemovingItem(false);
        });
    });
  }

  function handleAdd() {
    const ownerVnId = vn.id;
    const controller = beginCollectionAction(ownerVnId);
    if (!controller) return;
    setAddingItem(true);
    withCollectionTransition(
      ownerVnId,
      controller,
      () => call('POST', { status: 'planning' }, { signal: controller.signal }).then(() => {
        if (!ownsCollectionMutation(ownerVnId, controller)) return;
        if (identityRef.current === ownerVnId) toast.success(t.toast.added);
      }),
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
  const dumpedSaving = pendingFields.has('dumped') || pendingFields.has('dumped_ignored');

  async function handleRemove() {
    const ownerVnId = vn.id;
    const controller = beginCollectionAction(ownerVnId);
    if (!controller) return;
    setRemovingItem(true);
    const ok = await confirm({ message: t.form.removeConfirm, tone: 'danger' });
    if (!ok || !ownsCollectionMutation(ownerVnId, controller)) {
      finishCollectionMutation(controller);
      if (!unmountedRef.current && identityRef.current === ownerVnId) setRemovingItem(false);
      return;
    }
    clearPendingAutosave();
    withCollectionTransition(
      ownerVnId,
      controller,
      () => call('DELETE', undefined, { signal: controller.signal })
        .then(() => {
          if (ownsCollectionMutation(ownerVnId, controller)) toast.success(t.toast.removed);
        }),
      () => router.push('/'),
    );
  }

  async function addSeries(seriesId: number) {
    const ownerVnId = vn.id;
    const controller = beginSeriesMutation(ownerVnId);
    if (!controller) return;
    setError(null);
    setAddingSeries(true);
    try {
      const res = await fetch(`/api/series/${seriesId}/vn/${vn.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(await readApiError(res, t.common.error));
      if (!ownsSeriesMutation(ownerVnId, controller)) return;
      setSeriesPickerId('');
      toast.success(t.seriesAutoSuggest.added);
      startTransition(() => router.refresh());
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError' || !ownsSeriesMutation(ownerVnId, controller)) return;
      const message = (e as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      if (ownsSeriesMutation(ownerVnId, controller)) {
        finishSeriesMutation(controller);
        if (!unmountedRef.current) setAddingSeries(false);
      }
    }
  }

  async function removeSeries(seriesId: number) {
    const ownerVnId = vn.id;
    const controller = beginSeriesMutation(ownerVnId);
    if (!controller) return;
    setError(null);
    setRemovingSeriesId(seriesId);
    try {
      const res = await fetch(`/api/series/${seriesId}/vn/${vn.id}`, {
        method: 'DELETE',
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(await readApiError(res, t.common.error));
      if (!ownsSeriesMutation(ownerVnId, controller)) return;
      toast.success(t.toast.removedFromSeries);
      startTransition(() => router.refresh());
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError' || !ownsSeriesMutation(ownerVnId, controller)) return;
      const message = (e as Error).message;
      setError(message);
      toast.error(message);
    } finally {
      if (ownsSeriesMutation(ownerVnId, controller)) {
        finishSeriesMutation(controller);
        if (!unmountedRef.current) setRemovingSeriesId(null);
      }
    }
  }

  if (!inCollection) {
    return (
      <div className="p-4 sm:p-6">
        <p className="mb-4 text-muted">{t.form.notInCollection}</p>
        <button type="button" className="btn btn-primary" onClick={handleAdd} disabled={pending || addingItem}>
          <Plus className="h-4 w-4" aria-hidden />
          {pending || addingItem ? t.form.adding : t.form.add}
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
          dumpedIgnored={dumpedIgnored}
          onDumpedIgnoredChange={handleDumpedIgnoredChange}
        />
      </div>

      <NotesEditor notes={notes} onNotesChange={setNotes} />

      <div className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
        <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
          <Bookmark className="h-4 w-4" aria-hidden /> {t.detail.seriesSection}
        </h3>
        {myseries.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {myseries.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elev px-3 py-1 text-xs">
                <Link href={`/series/${s.id}`} className="hover:text-accent">{s.name}</Link>
                <button
                  type="button"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-status-dropped disabled:cursor-wait disabled:opacity-60 sm:min-h-0 sm:min-w-0"
                  onClick={() => removeSeries(s.id)}
                  disabled={addingSeries || removingSeriesId !== null}
                  aria-busy={removingSeriesId === s.id || undefined}
                  aria-label={t.series.removeFromSeries}
                >
                  {removingSeriesId === s.id
                    ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    : <X className="h-3 w-3" aria-hidden />}
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
              disabled={addingSeries || removingSeriesId !== null}
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
              disabled={!seriesPickerId || addingSeries || removingSeriesId !== null}
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
