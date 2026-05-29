'use client';
import { useState } from 'react';
import Link from 'next/link';
import { MapPin, Globe, Edit2, Trash2, Link2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import type { PlaceWithLinks } from '@/lib/db';

const STALE_DAYS = 7;
const MS_PER_DAY = 86_400_000;

interface Props {
  place: PlaceWithLinks;
  onEdit: (place: PlaceWithLinks) => void;
  onDelete: (place: PlaceWithLinks) => void;
  onAssign: (place: PlaceWithLinks) => void;
}

function freshnessLabel(t: ReturnType<typeof useT>, updatedAt: number): { label: string; stale: boolean } {
  const daysDiff = Math.floor((Date.now() - updatedAt) / MS_PER_DAY);
  if (daysDiff === 0) return { label: t.places.freshUpdatedToday as string, stale: false };
  if (daysDiff < STALE_DAYS) {
    return {
      label: (t.places.freshUpdatedDaysAgo as string).replace('{n}', String(daysDiff)),
      stale: false,
    };
  }
  return {
    label: (t.places.freshStale as string).replace('{n}', String(daysDiff)),
    stale: true,
  };
}

function kindLabel(t: ReturnType<typeof useT>, kind: PlaceWithLinks['kind']): string {
  const key = `kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
  return (t.places as Record<string, unknown>)[key] as string ?? kind;
}

export function PlaceCard({ place, onEdit, onDelete, onAssign }: Props) {
  const t = useT();
  const [deleting, setDeleting] = useState(false);
  const freshness = freshnessLabel(t, place.updated_at);

  function handleDelete() {
    if (!window.confirm(t.places.deleteConfirm as string)) return;
    setDeleting(true);
    fetch(`/api/places/${place.id}`, { method: 'DELETE' })
      .then(() => onDelete(place))
      .catch(() => setDeleting(false));
  }

  return (
    <div className={`relative flex flex-col rounded-xl border bg-bg-card p-4 gap-3 ${freshness.stale && place.provider_labels.length > 0 ? 'border-status-on_hold/30 opacity-80' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold text-white">{place.name}</p>
          {place.name_ja && (
            <p className="truncate text-xs text-muted">{place.name_ja}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onAssign(place)}
            className="icon-btn tap-target text-muted hover:text-accent"
            title={t.places.assignDialog as string}
            aria-label={t.places.assignDialog as string}
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onEdit(place)}
            className="icon-btn tap-target text-muted hover:text-white"
            title={t.places.editPlace as string}
            aria-label={t.places.editPlace as string}
          >
            <Edit2 className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="icon-btn tap-target text-muted hover:text-red-400"
            title={t.places.deletePlace as string}
            aria-label={t.places.deletePlace as string}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {place.address && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden />
          <span className="line-clamp-2">{place.address}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="chip text-muted">{kindLabel(t, place.kind)}</span>
        <span className={`chip ${place.provider_labels.length > 0 ? 'bg-accent/15 text-accent' : 'text-muted'}`}>
          {place.provider_labels.length > 0
            ? (t.places.linkedBranches as string).replace('{n}', String(place.provider_labels.length))
            : (t.places.noBranches as string)}
        </span>
        <span className={`chip ${place.stock_count > 0 ? 'bg-green-500/15 text-green-400' : 'text-muted'}`}>
          {place.stock_count > 0
            ? (t.places.stockCount as string).replace('{n}', String(place.stock_count))
            : (t.places.noStock as string)}
        </span>
        {place.provider_labels.length > 0 && (
          <span className={`chip ${freshness.stale ? 'bg-status-on_hold/10 text-status-on_hold' : 'text-muted'}`}>
            {freshness.label}
          </span>
        )}
        {place.lat != null && place.lng != null ? (
          <span className="chip text-muted" title={`${place.lat}, ${place.lng}`}>
            GPS
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/places/${place.id}`}
          className="btn btn-xs bg-accent/10 text-accent hover:bg-accent/20"
        >
          {t.places.openPlace as string}
        </Link>
        {place.url && (
          <a
            href={place.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent"
            title={place.url}
          >
            <Globe className="h-3 w-3" aria-hidden />
          </a>
        )}
        {place.lat != null && place.lng != null && (
          <Link
            href={`/map?place=${place.id}`}
            className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent"
          >
            <MapPin className="h-3 w-3" aria-hidden />
            {t.places.viewOnMap as string}
          </Link>
        )}
      </div>
    </div>
  );
}
