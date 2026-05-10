'use client';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'vn_recently_viewed_v1';
const MAX_ITEMS = 12;

export interface RecentEntry {
  id: string;
  title: string;
  poster: string | null;
  /** Local storage path, served via /api/files/<path> */
  localPoster: string | null;
  sexual: number | null;
  viewedAt: number;
}

function readStorage(): RecentEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.id === 'string') : [];
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
  const list = readStorage().filter((e) => e.id !== entry.id);
  list.unshift({ ...entry, viewedAt: Date.now() });
  writeStorage(list);
  window.dispatchEvent(new CustomEvent('vn:recently-viewed-updated'));
}

export function clearRecentlyViewed(): void {
  if (typeof window === 'undefined') return;
  writeStorage([]);
  window.dispatchEvent(new CustomEvent('vn:recently-viewed-updated'));
}

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
