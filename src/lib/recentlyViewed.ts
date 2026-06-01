'use client';
import { useCallback, useEffect, useState } from 'react';
import { asJsonRecord } from './json-shape';
import { isValidVnId, normalizeVnId } from './vn-id-shape';

const STORAGE_KEY = 'vn_recently_viewed_v1';
const MAX_ITEMS = 12;
const MAX_STORAGE_BYTES = 100_000;

export interface RecentEntry {
  id: string;
  title: string;
  poster: string | null;
  /** Local storage path, served via /api/files/<path> */
  localPoster: string | null;
  sexual: number | null;
  viewedAt: number;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function decodeRecentEntry(value: unknown): RecentEntry | null {
  const row = asJsonRecord(value);
  if (row === null) return null;
  const id = typeof row.id === 'string' ? row.id : null;
  if (
    !isValidVnId(id)
    || typeof row.title !== 'string'
    || row.title.trim().length === 0
    || !isNullableString(row.poster)
    || !isNullableString(row.localPoster)
    || (row.sexual !== null && (typeof row.sexual !== 'number' || !Number.isFinite(row.sexual)))
    || typeof row.viewedAt !== 'number'
    || !Number.isFinite(row.viewedAt)
    || row.viewedAt < 0
  ) {
    return null;
  }
  return {
    id: normalizeVnId(id),
    title: row.title,
    poster: row.poster,
    localPoster: row.localPoster,
    sexual: row.sexual,
    viewedAt: row.viewedAt,
  };
}

/**
 * Decode persisted recently-viewed rows for the home-page strip.
 *
 * @param value Decoded local-storage value.
 * @returns Valid rows in storage order, capped to the rendered strip limit.
 */
export function decodeRecentlyViewedEntries(value: unknown): RecentEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(decodeRecentEntry)
    .filter((entry): entry is RecentEntry => entry !== null)
    .slice(0, MAX_ITEMS);
}

function readStorage(): RecentEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > MAX_STORAGE_BYTES) return [];
    return decodeRecentlyViewedEntries(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeStorage(items: RecentEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // ignore quota / private mode errors
  }
}

/** Push or refresh an entry. */
export function recordRecentlyViewed(entry: Omit<RecentEntry, 'viewedAt'>): void {
  if (typeof window === 'undefined') return;
  const decoded = decodeRecentEntry({ ...entry, viewedAt: Date.now() });
  if (!decoded) return;
  const list = readStorage().filter((stored) => stored.id !== decoded.id);
  list.unshift(decoded);
  writeStorage(list);
  window.dispatchEvent(new CustomEvent('vn:recently-viewed-updated'));
}

/** Empty the recently-viewed list and notify subscribed components. */
export function clearRecentlyViewed(): void {
  if (typeof window === 'undefined') return;
  writeStorage([]);
  window.dispatchEvent(new CustomEvent('vn:recently-viewed-updated'));
}

/**
 * React hook for the recently-viewed strip. Re-renders on the
 * `vn:recently-viewed-updated` CustomEvent (same-tab) and the native
 * `storage` event (cross-tab) so the list stays in sync everywhere.
 */
export function useRecentlyViewed(): { items: RecentEntry[]; clear: () => void } {
  const [items, setItems] = useState<RecentEntry[]>([]);

  const reload = useCallback(() => {
    setItems(readStorage());
  }, []);

  useEffect(() => {
    reload();
    const onUpdate = () => reload();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) reload();
    };
    window.addEventListener('vn:recently-viewed-updated', onUpdate);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('vn:recently-viewed-updated', onUpdate);
      window.removeEventListener('storage', onStorage);
    };
  }, [reload]);

  return {
    items,
    clear: () => {
      clearRecentlyViewed();
    },
  };
}
