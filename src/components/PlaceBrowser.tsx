'use client';
import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import type { PlaceWithLinks } from '@/lib/db';
import { PlaceCard } from './PlaceCard';
import { AddEditPlaceModal } from './AddEditPlaceModal';
import { AssignProviderDialog } from './AssignProviderDialog';
import { SkeletonRows } from './Skeleton';

type Tab = 'all' | 'linked' | 'unlinked' | 'unassigned';

interface UnassignedRow {
  branch: string;
}

export function PlaceBrowser() {
  const t = useT();
  const [places, setPlaces] = useState<PlaceWithLinks[]>([]);
  const [unassigned, setUnassigned] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [editTarget, setEditTarget] = useState<PlaceWithLinks | null | 'new'>(null);
  const [assignTarget, setAssignTarget] = useState<PlaceWithLinks | null>(null);

  const reload = useCallback(async () => {
    const [pRes, uRes] = await Promise.all([
      fetch('/api/places'),
      fetch('/api/places/unassigned'),
    ]);
    const [pd, ud] = await Promise.all([pRes.json(), uRes.json()]);
    setPlaces(pd.places ?? []);
    setUnassigned(ud.branches ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  function handleDelete(deleted: PlaceWithLinks) {
    setPlaces((prev) => prev.filter((p) => p.id !== deleted.id));
  }

  const visible =
    tab === 'all'
      ? places
      : tab === 'linked'
        ? places.filter((p) => p.provider_labels.length > 0)
        : tab === 'unlinked'
          ? places.filter((p) => p.provider_labels.length === 0)
          : [];

  const TABS: { id: Tab; label: string }[] = [
    { id: 'all', label: `${t.places.tabAll} (${places.length})` },
    { id: 'linked', label: `${t.places.tabLinked} (${places.filter((p) => p.provider_labels.length > 0).length})` },
    { id: 'unlinked', label: `${t.places.tabUnlinked} (${places.filter((p) => p.provider_labels.length === 0).length})` },
    { id: 'unassigned', label: `${t.places.tabUnassigned} (${unassigned.length})` },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">{t.places.title as string}</h1>
          <p className="mt-1 text-sm text-muted">{t.places.subtitle as string}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditTarget('new')}
          className="btn bg-accent text-bg hover:bg-accent/80 inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t.places.addPlace as string}
        </button>
      </div>

      <div className="mb-6 flex flex-wrap gap-1">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`chip tap-target ${tab === id ? 'chip-active' : 'text-muted hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonRows count={4} />
      ) : tab === 'unassigned' ? (
        unassigned.length === 0 ? (
          <p className="text-sm text-muted">{t.places.unassignedEmpty as string}</p>
        ) : (
          <ul className="space-y-2">
            {unassigned.map((branch) => (
              <li
                key={branch}
                className="rounded-lg border border-border bg-bg-card px-4 py-3 text-sm text-muted"
              >
                {branch}
              </li>
            ))}
          </ul>
        )
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted">{t.places.noPlaces as string}</p>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 280px)), 1fr))' }}
        >
          {visible.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              onEdit={setEditTarget}
              onDelete={handleDelete}
              onAssign={setAssignTarget}
            />
          ))}
        </div>
      )}

      {editTarget !== null && (
        <AddEditPlaceModal
          place={editTarget === 'new' ? null : editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); reload(); }}
        />
      )}
      {assignTarget !== null && (
        <AssignProviderDialog
          place={assignTarget}
          onClose={() => setAssignTarget(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
