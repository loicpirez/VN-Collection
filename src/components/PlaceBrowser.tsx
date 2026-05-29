'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import type { PlaceWithLinks } from '@/lib/db';
import { PlaceCard } from './PlaceCard';
import { AddEditPlaceModal } from './AddEditPlaceModal';
import { AssignProviderDialog } from './AssignProviderDialog';
import { SkeletonRows } from './Skeleton';

type Tab = 'all' | 'linked' | 'unlinked' | 'unassigned';
type SortKey = 'name' | 'stock';

export function PlaceBrowser() {
  const t = useT();
  const [places, setPlaces] = useState<PlaceWithLinks[]>([]);
  const [unassigned, setUnassigned] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [sort, setSort] = useState<SortKey>('name');
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<PlaceWithLinks | null | 'new'>(null);
  const [assignTarget, setAssignTarget] = useState<PlaceWithLinks | null>(null);
  const [assignBranchTarget, setAssignBranchTarget] = useState<string | null>(null);

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

  const q = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    let list =
      tab === 'all'
        ? places
        : tab === 'linked'
          ? places.filter((p) => p.provider_labels.length > 0)
          : tab === 'unlinked'
            ? places.filter((p) => p.provider_labels.length === 0)
            : [];
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.name_ja?.toLowerCase().includes(q) ?? false) ||
          p.provider_labels.some((l) => l.toLowerCase().includes(q)),
      );
    }
    return [...list].sort((a, b) => {
      if (sort === 'stock') return b.stock_count - a.stock_count;
      return a.name.localeCompare(b.name);
    });
  }, [places, tab, q, sort]);

  const filteredUnassigned = useMemo(() => {
    if (!q) return unassigned;
    return unassigned.filter((b) => b.toLowerCase().includes(q));
  }, [unassigned, q]);

  const TABS: { id: Tab; label: string }[] = [
    { id: 'all', label: `${t.places.tabAll} (${places.length})` },
    { id: 'linked', label: `${t.places.tabLinked} (${places.filter((p) => p.provider_labels.length > 0).length})` },
    { id: 'unlinked', label: `${t.places.tabUnlinked} (${places.filter((p) => p.provider_labels.length === 0).length})` },
    { id: 'unassigned', label: `${t.places.tabUnassigned} (${unassigned.length})` },
  ];

  const SORTS: { id: SortKey; label: string }[] = [
    { id: 'name', label: t.places.sortName as string },
    { id: 'stock', label: t.places.sortStock as string },
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
          <input
            className="input w-full pl-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.places.searchPlaceholder as string}
            aria-label={t.places.searchPlaceholder as string}
          />
        </div>
        <div className="flex gap-1">
          {SORTS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSort(id)}
              className={`chip tap-target ${sort === id ? 'chip-active' : 'text-muted hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
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
        filteredUnassigned.length === 0 ? (
          <p className="text-sm text-muted">{t.places.unassignedEmpty as string}</p>
        ) : (
          <ul className="space-y-2">
            {filteredUnassigned.map((branch) => (
              <li
                key={branch}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-card px-4 py-3"
              >
                <span className="text-sm text-white truncate">{branch}</span>
                <button
                  type="button"
                  onClick={() => setAssignBranchTarget(branch)}
                  className="btn btn-xs bg-accent/10 text-accent hover:bg-accent/20 shrink-0"
                >
                  {t.places.unassignedAssignCta as string}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted">{t.places.noPlaces as string}</p>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 280px)), 1fr))' }}
        >
          {filtered.map((place) => (
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
          initialBranch={null}
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
      {assignBranchTarget !== null && (
        <AddEditPlaceModal
          place={null}
          initialBranch={assignBranchTarget}
          onClose={() => setAssignBranchTarget(null)}
          onSaved={async (newId) => {
            if (newId != null) {
              await fetch(`/api/places/${newId}/link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider_label: assignBranchTarget }),
              });
            }
            setAssignBranchTarget(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
