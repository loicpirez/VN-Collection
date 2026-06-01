/**
 * Unit tests for src/lib/recentlyViewed.ts
 *
 * The module is client-side and relies on `window.localStorage` plus the
 * `CustomEvent` mechanism. Vitest runs under the `node` environment by
 * default, so we stub the minimal browser globals needed before
 * importing the module under test.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Minimal localStorage shim — covers getItem / setItem / removeItem.
class FakeLocalStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

const fakeLocalStorage = new FakeLocalStorage();

// Stub the browser globals before the module imports.
(globalThis as unknown as { window: { localStorage: FakeLocalStorage; dispatchEvent: (evt: Event) => boolean; addEventListener: (type: string, handler: EventListener) => void; removeEventListener: (type: string, handler: EventListener) => void } }).window = {
  localStorage: fakeLocalStorage,
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
(globalThis as unknown as { localStorage: FakeLocalStorage }).localStorage = fakeLocalStorage;

// CustomEvent isn't on Node's globalThis by default but the lib code
// only constructs the event — never inspects its members.
class FakeCustomEvent extends Event {
  detail: unknown;
  constructor(type: string, init?: { detail?: unknown }) {
    super(type);
    this.detail = init?.detail;
  }
}
(globalThis as unknown as { CustomEvent: typeof FakeCustomEvent }).CustomEvent = FakeCustomEvent;

const STORAGE_KEY = 'vn_recently_viewed_v1';

// Dynamic import so the module sees the shims.
async function loadModule(): Promise<typeof import('@/lib/recentlyViewed')> {
  return await import('@/lib/recentlyViewed');
}

describe('recentlyViewed — recordRecentlyViewed / clearRecentlyViewed', () => {
  beforeEach(() => {
    fakeLocalStorage.clear();
  });

  it('records a fresh entry into localStorage', async () => {
    const { recordRecentlyViewed } = await loadModule();
    recordRecentlyViewed({
      id: 'v90001',
      title: 'Synthetic VN A',
      poster: null,
      localPoster: 'vn/v90001.jpg',
      sexual: 0,
    });
    const raw = fakeLocalStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const items = JSON.parse(raw as string) as Array<{ id: string; title: string }>;
    expect(items.length).toBe(1);
    expect(items[0].id).toBe('v90001');
    expect(items[0].title).toBe('Synthetic VN A');
  });

  it('deduplicates the same id to a single front-of-list entry', async () => {
    const { recordRecentlyViewed } = await loadModule();
    recordRecentlyViewed({ id: 'v90002', title: 'A', poster: null, localPoster: null, sexual: 0 });
    recordRecentlyViewed({ id: 'v90003', title: 'B', poster: null, localPoster: null, sexual: 0 });
    recordRecentlyViewed({ id: 'v90002', title: 'A-again', poster: null, localPoster: null, sexual: 0 });
    const items = JSON.parse(fakeLocalStorage.getItem(STORAGE_KEY) as string) as Array<{ id: string; title: string }>;
    expect(items.length).toBe(2);
    expect(items[0].id).toBe('v90002');
    expect(items[0].title).toBe('A-again');
    expect(items[1].id).toBe('v90003');
  });

  it('caps the list at MAX_ITEMS = 12 entries', async () => {
    const { recordRecentlyViewed } = await loadModule();
    for (let i = 0; i < 15; i++) {
      recordRecentlyViewed({
        id: `v9${String(i).padStart(4, '0')}`,
        title: `T${i}`,
        poster: null,
        localPoster: null,
        sexual: 0,
      });
    }
    const items = JSON.parse(fakeLocalStorage.getItem(STORAGE_KEY) as string) as Array<{ id: string }>;
    expect(items.length).toBe(12);
    // Newest first.
    expect(items[0].id).toBe('v90014');
    // Oldest preserved within the cap window.
    expect(items[11].id).toBe('v90003');
  });

  it('clearRecentlyViewed empties the storage list', async () => {
    const { recordRecentlyViewed, clearRecentlyViewed } = await loadModule();
    recordRecentlyViewed({ id: 'v90099', title: 'X', poster: null, localPoster: null, sexual: 0 });
    clearRecentlyViewed();
    const items = JSON.parse(fakeLocalStorage.getItem(STORAGE_KEY) as string) as unknown[];
    expect(items.length).toBe(0);
  });

  it('readStorage returns empty array on corrupt JSON in localStorage', async () => {
    fakeLocalStorage.setItem(STORAGE_KEY, '{not valid json');
    const { recordRecentlyViewed } = await loadModule();
    // recording on top of corrupt data should not crash; the new
    // entry replaces whatever was there.
    recordRecentlyViewed({ id: 'v90050', title: 'Recovered', poster: null, localPoster: null, sexual: 0 });
    const items = JSON.parse(fakeLocalStorage.getItem(STORAGE_KEY) as string) as Array<{ id: string }>;
    expect(items.length).toBe(1);
    expect(items[0].id).toBe('v90050');
  });

  it('drops malformed stored rows and canonicalizes accepted ids', async () => {
    const { decodeRecentlyViewedEntries } = await loadModule();
    expect(decodeRecentlyViewedEntries([
      {
        id: 'V90051',
        title: 'Recovered',
        poster: null,
        localPoster: null,
        sexual: 0,
        viewedAt: 1,
      },
      {
        id: 'v90052',
        title: { malformed: true },
        poster: null,
        localPoster: null,
        sexual: 0,
        viewedAt: 2,
      },
      {
        id: 'not-a-vn',
        title: 'Rejected',
        poster: null,
        localPoster: null,
        sexual: 0,
        viewedAt: 3,
      },
    ])).toEqual([{
      id: 'v90051',
      title: 'Recovered',
      poster: null,
      localPoster: null,
      sexual: 0,
      viewedAt: 1,
    }]);
  });

  it('caps decoded storage rows to the rendered strip limit', async () => {
    const { decodeRecentlyViewedEntries } = await loadModule();
    const rows = Array.from({ length: 15 }, (_, i) => ({
      id: `v8${String(i).padStart(4, '0')}`,
      title: `Fixture ${i}`,
      poster: null,
      localPoster: null,
      sexual: null,
      viewedAt: i,
    }));
    expect(decodeRecentlyViewedEntries(rows)).toHaveLength(12);
  });
});
