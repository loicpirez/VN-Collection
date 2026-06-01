'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X, Search } from 'lucide-react';
import { useDialogA11y } from './Dialog';
import { useLocale, useT } from '@/lib/i18n/client';
import { useConfirm } from './ConfirmDialog';
import type { PlaceWithLinks } from '@/lib/db';
import { hasFiniteCoordinates } from '@/lib/place-coordinates';
import { geocodingAcceptLanguage } from '@/lib/map-privacy';
import { MapPrivacyControl } from './MapPrivacyControl';

type PlaceKind = 'shop' | 'chain' | 'storage';

interface Props {
  place: PlaceWithLinks | null;
  initialBranch?: string | null;
  onClose: () => void;
  onSaved: (newId?: number) => void;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

export function AddEditPlaceModal({ place, initialBranch, onClose, onSaved }: Props) {
  const t = useT();
  const locale = useLocale();
  const { confirm } = useConfirm();
  const panelRef = useRef<HTMLDivElement | null>(null);

  const initial = {
    name: place?.name ?? initialBranch ?? '',
    nameJa: place?.name_ja ?? '',
    kind: (place?.kind ?? 'shop') as PlaceKind,
    address: place?.address ?? '',
    lat: place?.lat != null ? String(place.lat) : '',
    lng: place?.lng != null ? String(place.lng) : '',
    url: place?.url ?? '',
    notes: place?.notes ?? '',
  };

  const [name, setName] = useState(initial.name);
  const [nameJa, setNameJa] = useState(initial.nameJa);
  const [kind, setKind] = useState<PlaceKind>(initial.kind);
  const [address, setAddress] = useState(initial.address);
  const [lat, setLat] = useState(initial.lat);
  const [lng, setLng] = useState(initial.lng);
  const [url, setUrl] = useState(initial.url);
  const [notes, setNotes] = useState(initial.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geocodeQ, setGeocodeQ] = useState('');
  const [geocodeResults, setGeocodeResults] = useState<NominatimResult[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [externalNetworkAllowed, setExternalNetworkAllowed] = useState(false);

  const dirty =
    name !== initial.name ||
    nameJa !== initial.nameJa ||
    kind !== initial.kind ||
    address !== initial.address ||
    lat !== initial.lat ||
    lng !== initial.lng ||
    url !== initial.url ||
    notes !== initial.notes;

  /**
   * Close guard for the backdrop / Esc / Cancel affordances. When the
   * form holds unsaved edits, confirm before discarding so a stray
   * click or keypress can't lose the operator's input. While saving,
   * the dialog is locked shut.
   */
  const requestClose = useCallback(async () => {
    if (saving) return;
    if (dirty) {
      const ok = await confirm({ message: t.places.discardConfirm as string, tone: 'danger' });
      if (!ok) return;
    }
    onClose();
  }, [saving, dirty, confirm, t, onClose]);

  useDialogA11y({ open: true, onClose: requestClose, panelRef });

  useEffect(() => {
    if (!name && initialBranch) setName(initialBranch);
  }, [initialBranch]);

  async function geocode() {
    if (!geocodeQ.trim()) return;
    if (!externalNetworkAllowed) {
      setGeocodeError(t.map.externalPrivacyRequired as string);
      return;
    }
    setGeocoding(true);
    setGeocodeResults([]);
    setGeocodeError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(geocodeQ)}&format=jsonv2&limit=5`,
        { headers: { 'Accept-Language': geocodingAcceptLanguage(locale) } },
      );
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as NominatimResult[];
      if (data.length === 0) setGeocodeError(t.places.geocodeEmpty as string);
      else setGeocodeResults(data);
    } catch {
      setGeocodeError(t.places.geocodeError as string);
    }
    setGeocoding(false);
  }

  function pickResult(r: NominatimResult) {
    setLat(r.lat);
    setLng(r.lon);
    if (!address) setAddress(r.display_name);
    setGeocodeResults([]);
    setGeocodeQ('');
    setGeocodeError(null);
  }

  function clearCoords() {
    setLat('');
    setLng('');
  }

  async function handleSave() {
    if (!name.trim()) return;
    setError(null);
    const coordinates = {
      lat: lat !== '' ? Number(lat) : null,
      lng: lng !== '' ? Number(lng) : null,
    };
    const hasAnyCoordinate = coordinates.lat != null || coordinates.lng != null;
    if (hasAnyCoordinate && !hasFiniteCoordinates(coordinates)) {
      setError(t.places.invalidCoordinates as string);
      return;
    }
    setSaving(true);
    const body = {
      name: name.trim(),
      name_ja: nameJa.trim() || null,
      kind,
      address: address.trim() || null,
      lat: coordinates.lat,
      lng: coordinates.lng,
      url: url.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (place) {
        const res = await fetch(`/api/places/${place.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        onSaved();
      } else {
        const res = await fetch('/api/places', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = (await res.json()) as { id?: number };
        onSaved(data.id);
      }
    } catch {
      setError(t.common.error as string);
    }
    setSaving(false);
  }

  const KINDS: PlaceKind[] = ['shop', 'chain', 'storage'];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-bg/80 backdrop-blur" onClick={requestClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={place ? (t.places.editPlace as string) : (t.places.addPlace as string)}
        tabIndex={-1}
        className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-bg-card p-6 shadow-card outline-none overflow-y-auto max-h-[90vh]"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white">
            {place ? (t.places.editPlace as string) : (t.places.addPlace as string)}
            {initialBranch && !place && (
              <span className="ml-2 text-[11px] font-normal text-muted">{initialBranch}</span>
            )}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            className="icon-btn tap-target text-muted hover:text-white"
            aria-label={t.common.close as string}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="label text-xs">{t.places.namePlaceholder as string}</label>
            <input
              className="input w-full mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.places.namePlaceholder as string}
              autoFocus
            />
          </div>
          <div>
            <label className="label text-xs">{t.places.nameJaPlaceholder as string}</label>
            <input
              className="input w-full mt-1"
              value={nameJa}
              onChange={(e) => setNameJa(e.target.value)}
              placeholder={t.places.nameJaPlaceholder as string}
            />
          </div>

          <div>
            <label className="label text-xs">{t.places.kindLabel as string}</label>
            <div className="mt-1 flex gap-1">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`chip tap-target ${kind === k ? 'chip-active' : 'text-muted hover:text-white'}`}
                >
                  {(t.places as Record<string, unknown>)[`kind${k.charAt(0).toUpperCase()}${k.slice(1)}`] as string}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label text-xs">{t.places.addressPlaceholder as string}</label>
            <input
              className="input w-full mt-1"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t.places.addressPlaceholder as string}
            />
          </div>

          <div className="rounded-lg border border-border bg-bg-elev/40 p-3 space-y-2">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-widest">{t.places.geocodeSearch as string}</p>
            <MapPrivacyControl compact onChange={setExternalNetworkAllowed} />
            <div className="flex gap-2">
              <input
                className="input flex-1 text-sm"
                value={geocodeQ}
                onChange={(e) => setGeocodeQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && geocode()}
                disabled={!externalNetworkAllowed}
                placeholder={t.places.addressPlaceholder as string}
              />
              <button
                type="button"
                onClick={geocode}
                disabled={geocoding || !externalNetworkAllowed}
                aria-label={t.places.geocodeButton as string}
                className="btn btn-sm bg-bg-elev text-muted hover:text-white"
              >
                <Search className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            {geocodeError && (
              <p className="text-[11px] text-status-dropped">{geocodeError}</p>
            )}
            {geocodeResults.length > 0 && (
              <ul className="space-y-1">
                {geocodeResults.map((r, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => pickResult(r)}
                      className="w-full rounded border border-border bg-bg px-2 py-1.5 text-left text-[11px] text-muted hover:border-accent/40 hover:text-white"
                    >
                      {r.display_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">{t.places.latPlaceholder as string}</label>
              <input
                className="input w-full mt-1"
                type="number"
                inputMode="decimal"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="35.6894"
              />
            </div>
            <div>
              <label className="label text-xs">{t.places.lngPlaceholder as string}</label>
              <input
                className="input w-full mt-1"
                type="number"
                inputMode="decimal"
                step="any"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="139.6917"
              />
            </div>
          </div>
          {(lat !== '' || lng !== '') && (
            <button
              type="button"
              onClick={clearCoords}
              className="text-[11px] text-muted hover:text-status-dropped"
            >
              {t.places.clearCoords as string}
            </button>
          )}

          <div>
            <label className="label text-xs">{t.places.urlPlaceholder as string}</label>
            <input
              className="input w-full mt-1"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="label text-xs">{t.places.notesPlaceholder as string}</label>
            <textarea
              className="input w-full mt-1 min-h-[60px] resize-y"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.places.notesPlaceholder as string}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-xs text-status-dropped">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={requestClose} className="btn btn-sm text-muted">
            {t.places.cancel as string}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="btn btn-sm btn-primary"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {t.places.saveChanges as string}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
