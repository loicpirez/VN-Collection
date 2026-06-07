// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import type { ShelfDisplaySlotEntry, ShelfEntry, ShelfSlotEntry, ShelfUnit, ShelfUnitWithCount } from '@/lib/db';

let searchParamsValue = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/shelf',
  useSearchParams: () => searchParamsValue,
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt }: { alt: string }) => <span data-mock-safe-image>{alt}</span>,
}));
vi.mock('@/components/EditionInfoPopover', () => ({
  EditionInfoTrigger: () => <span data-mock-edition-info />,
}));

import { ShelfLayoutEditor } from '@/components/ShelfLayoutEditor';

function unit(overrides: Partial<ShelfUnitWithCount> = {}): ShelfUnitWithCount {
  return { id: 1, name: 'Studio X', cols: 2, rows: 2, order_index: 0, created_at: 0, updated_at: 0, placed_count: 0, ...overrides };
}
function bareUnit(overrides: Partial<ShelfUnit> = {}): ShelfUnit {
  const { placed_count: _omit, ...rest } = unit(overrides as Partial<ShelfUnitWithCount>);
  void _omit;
  return rest;
}
function poolEntry(overrides: Partial<ShelfEntry> = {}): ShelfEntry {
  return {
    vn_id: 'v90001',
    release_id: 'r90001',
    notes: null,
    location: 'unknown',
    physical_location: [],
    box_type: 'none',
    edition_label: null,
    condition: null,
    price_paid: null,
    currency: null,
    acquired_date: null,
    owned_platform: null,
    dumped: false,
    added_at: 0,
    vn_title: 'Title Y',
    vn_image_thumb: null,
    vn_image_url: 'https://example.test/c.jpg',
    vn_local_image_thumb: null,
    vn_image_sexual: 0,
    rel_image_thumb: null,
    rel_image_url: null,
    rel_local_image_thumb: null,
    rel_image_sexual: null,
    vn_platforms: [],
    vn_languages: [],
    vn_released: null,
    rel_title: null,
    rel_platforms: [],
    rel_languages: [],
    rel_released: null,
    rel_resolution: null,
    rel_minage: null,
    rel_patch: false,
    rel_freeware: false,
    rel_official: true,
    rel_has_ero: false,
    ...overrides,
  };
}
function slot(overrides: Partial<ShelfSlotEntry> = {}): ShelfSlotEntry {
  const {
    notes: _notes,
    location: _location,
    added_at: _addedAt,
    rel_minage: _relMinage,
    rel_patch: _relPatch,
    rel_freeware: _relFreeware,
    rel_official: _relOfficial,
    rel_has_ero: _relHasEro,
    ...base
  } = poolEntry(overrides);
  void [_notes, _location, _addedAt, _relMinage, _relPatch, _relFreeware, _relOfficial, _relHasEro];
  return { ...base, shelf_id: 1, row: 0, col: 0, box_type: base.box_type as ShelfSlotEntry['box_type'], ...overrides };
}
function displaySlot(overrides: Partial<ShelfDisplaySlotEntry> = {}): ShelfDisplaySlotEntry {
  return { ...slot(overrides), after_row: 0, position: 0, placed_at: 1, ...overrides };
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

interface DeferredResponse {
  promise: Promise<Response>;
  resolve(value: Response): void;
  reject(error: Error): void;
}

function deferredResponse(): DeferredResponse {
  let resolve!: (value: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('ShelfLayoutEditor branches', () => {
  beforeEach(() => {
    searchParamsValue = new URLSearchParams();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.match(/\/api\/shelves\/(\d+)$/)) return json({ shelf: bareUnit(), slots: [], displays: [] });
      if (url.includes('/api/shelves')) return json({ shelves: [unit()] });
      return json({ ok: true });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['Remove a column', { cols: 1, rows: 2 }],
    ['Add a row', { cols: 2, rows: 3 }],
    ['Remove a row', { cols: 2, rows: 1 }],
  ])('PATCHes a resize via the %s stepper', async (label, resized) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail && init?.method === 'PATCH') {
        return json({ shelf: bareUnit(resized), slots: [], evicted: [] });
      }
      if (detail) return json({ shelf: bareUnit(), slots: [], displays: [] });
      return json({ ok: true });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'PATCH');
      expect(patch).toBeTruthy();
    });
  });

  it('does not PATCH when a decrement is already at the minimum dimension', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.match(/\/api\/shelves\/(\d+)$/)) return json({ shelf: bareUnit({ cols: 1, rows: 1 }), slots: [], displays: [] });
      if (url.includes('/api/shelves')) return json({ shelves: [unit({ cols: 1, rows: 1 })] });
      return json({ ok: true });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit({ cols: 1, rows: 1 })]} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fetchMock.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Remove a column' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove a row' }));
    const patches = fetchMock.mock.calls.filter(([, i]) => (i as RequestInit)?.method === 'PATCH');
    expect(patches).toHaveLength(0);
  });

  it('clamps non-finite shelf dimensions before PATCHing a resize', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail && init?.method === 'PATCH') return json({ shelf: bareUnit({ cols: 1, rows: 1 }), slots: [], evicted: [] });
      if (detail) return json({ shelf: bareUnit(), slots: [], displays: [] });
      return json({ ok: true });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit({ cols: Number.NaN, rows: Number.NaN })]} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Add a row' }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'PATCH');
      expect(patch).toBeTruthy();
      const body = JSON.parse(String((patch?.[1] as RequestInit).body)) as { cols: number; rows: number };
      expect(body).toEqual({ cols: 1, rows: 1 });
    });
  });

  it('renders gracefully when ?highlight references a VN held by no shelf', async () => {
    searchParamsValue = new URLSearchParams('highlight=v90999');
    const shelves = [unit({ id: 1, name: 'Studio X' }), unit({ id: 2, name: 'Studio W' })];
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail) return json({ shelf: bareUnit({ id: Number(detail[1]) }), slots: [], displays: [] });
      if (url.includes('/api/shelves')) return json({ shelves });
      return json({ ok: true });
    }) as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={shelves} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    // The first shelf stays selected because no shelf holds v90999.
    expect(screen.getByRole('tab', { name: /Studio X/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('toasts when the active shelf detail payload is malformed', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.match(/\/api\/shelves\/(\d+)$/)) return json({ shelf: bareUnit(), slots: [], displays: null });
      return json({ shelves: [unit()] });
    }) as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() => expect(document.body.textContent).toContain('Save failed'));
  });

  it('uses the generic save message when active shelf detail fails without text', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.match(/\/api\/shelves\/(\d+)$/)) throw new Error('');
      return json({ shelves: [unit()] });
    }) as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() => expect(document.body.textContent).toContain('Save failed'));
  });

  it('ignores active shelf detail completions after the component unmounts', async () => {
    const pending = deferredResponse();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.match(/\/api\/shelves\/(\d+)$/)) return pending.promise;
      return json({ shelves: [unit()] });
    }) as unknown as typeof fetch;
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const view = renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).match(/\/api\/shelves\/(\d+)$/))).toBe(true));
    view.unmount();
    pending.resolve(json({ shelf: bareUnit(), slots: [], displays: [] }));
    await act(async () => {
      await pending.promise;
    });
    expect(document.body.textContent).not.toContain('Save failed');
  });

  it('suppresses active shelf detail errors after the component unmounts', async () => {
    const pending = deferredResponse();
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.match(/\/api\/shelves\/(\d+)$/)) return pending.promise;
      return json({ shelves: [unit()] });
    }) as unknown as typeof fetch;
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const view = renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).match(/\/api\/shelves\/(\d+)$/))).toBe(true));
    view.unmount();
    pending.reject(new Error('detail after unmount'));
    await act(async () => {
      await pending.promise.catch(() => undefined);
    });
    expect(document.body.textContent).not.toContain('detail after unmount');
  });

  it('ignores malformed highlight detail payloads and can find a display-only highlighted VN', async () => {
    searchParamsValue = new URLSearchParams('highlight=v90088');
    const shelves = [unit({ id: 1, name: 'Studio X' }), unit({ id: 2, name: 'Studio W' })];
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail?.[1] === '1') return json({ shelf: bareUnit({ id: 1 }), slots: [], displays: null });
      if (detail?.[1] === '2') {
        return json({
          shelf: bareUnit({ id: 2, name: 'Studio W' }),
          slots: [],
          displays: [displaySlot({ shelf_id: 2, vn_id: 'v90088', release_id: 'r90088', vn_title: 'Display Highlight' })],
        });
      }
      return json({ shelves });
    }) as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={shelves} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Studio W/ }).getAttribute('aria-selected')).toBe('true'),
    );
    await waitFor(() => expect(screen.getAllByText('Display Highlight').length).toBeGreaterThan(0));
  });

  it('uses CSS.escape when scrolling a highlighted VN into view', async () => {
    const escape = vi.fn((input: string) => input);
    const root = globalThis as typeof globalThis & { CSS?: { escape?: (input: string) => string } };
    const priorCss = root.CSS;
    const scrollIntoView = vi.fn();
    const priorScrollIntoView = Element.prototype.scrollIntoView;
    try {
      Object.defineProperty(globalThis, 'CSS', { configurable: true, value: { escape } });
      Element.prototype.scrollIntoView = scrollIntoView;
      searchParamsValue = new URLSearchParams('highlight=v90077');
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.match(/\/api\/shelves\/(\d+)$/)) {
          return json({
            shelf: bareUnit(),
            slots: [slot({ vn_id: 'v90077', release_id: 'r90077', vn_title: 'Escaped Highlight' })],
            displays: [],
          });
        }
        return json({ shelves: [unit()] });
      }) as unknown as typeof fetch;
      renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />, { locale: 'en' });
      await waitFor(() => expect(screen.getAllByText('Escaped Highlight').length).toBeGreaterThan(0));
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      expect(escape).toHaveBeenCalledWith('v90077');
      expect(scrollIntoView).toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'CSS', { configurable: true, value: priorCss });
      Element.prototype.scrollIntoView = priorScrollIntoView;
    }
  });

  it('does not require scrollIntoView when the highlighted shelf target exists', async () => {
    const priorScrollIntoView = Element.prototype.scrollIntoView;
    try {
      Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: undefined });
      searchParamsValue = new URLSearchParams('highlight=v90079');
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.match(/\/api\/shelves\/(\d+)$/)) {
          return json({
            shelf: bareUnit(),
            slots: [slot({ vn_id: 'v90079', release_id: 'r90079', vn_title: 'No Scroll Highlight' })],
            displays: [],
          });
        }
        return json({ shelves: [unit()] });
      }) as unknown as typeof fetch;
      renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />, { locale: 'en' });
      await waitFor(() => expect(screen.getAllByText('No Scroll Highlight').length).toBeGreaterThan(0));
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      expect(screen.getAllByText('No Scroll Highlight').length).toBeGreaterThan(0);
    } finally {
      Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: priorScrollIntoView });
    }
  });

  it('continues highlight scanning after a shelf detail fetch rejects', async () => {
    searchParamsValue = new URLSearchParams('highlight=v90080');
    const shelves = [unit({ id: 1, name: 'Studio X' }), unit({ id: 2, name: 'Studio W' })];
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail?.[1] === '1') return json({ shelf: bareUnit({ id: 1 }), slots: [], displays: [] });
      if (detail?.[1] === '2') throw new Error('highlight fetch failed');
      return json({ shelves });
    }) as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={shelves} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() => expect(screen.getByRole('tab', { name: /Studio X/ }).getAttribute('aria-selected')).toBe('true'));
  });

  it('ignores highlighted shelf detail completions after unmount', async () => {
    const pending = deferredResponse();
    searchParamsValue = new URLSearchParams('highlight=v90081');
    const shelves = [unit({ id: 1, name: 'Studio X' }), unit({ id: 2, name: 'Studio W' })];
    let secondShelfRequested = false;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail?.[1] === '1') return json({ shelf: bareUnit({ id: 1 }), slots: [], displays: [] });
      if (detail?.[1] === '2') {
        secondShelfRequested = true;
        return pending.promise.then(() => json({
          shelf: bareUnit({ id: 2, name: 'Studio W' }),
          slots: [slot({ shelf_id: 2, vn_id: 'v90081', release_id: 'r90081', vn_title: 'Unmount Highlight' })],
          displays: [],
        }));
      }
      return json({ shelves });
    }) as unknown as typeof fetch;
    const view = renderWithProviders(<ShelfLayoutEditor initialShelves={shelves} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() => expect(secondShelfRequested).toBe(true));
    view.unmount();
    pending.resolve(json({ ok: true }));
    await act(async () => {
      await pending.promise;
    });
    expect(document.body.textContent).not.toContain('Unmount Highlight');
  });

  it('stops highlight scanning between shelves after unmount', async () => {
    const pending = deferredResponse();
    searchParamsValue = new URLSearchParams('highlight=v90082');
    const shelves = [unit({ id: 1, name: 'Studio X' }), unit({ id: 2, name: 'Studio W' })];
    let firstShelfCalls = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail?.[1] === '1') {
        firstShelfCalls += 1;
        if (firstShelfCalls === 1) return json({ shelf: bareUnit({ id: 1 }), slots: [], displays: [] });
        return pending.promise;
      }
      if (detail?.[1] === '2') return json({ shelf: bareUnit({ id: 2 }), slots: [], displays: [] });
      return json({ shelves });
    }) as unknown as typeof fetch;
    const view = renderWithProviders(<ShelfLayoutEditor initialShelves={shelves} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() => expect(firstShelfCalls).toBeGreaterThanOrEqual(2));
    view.unmount();
    pending.resolve(json({ shelf: bareUnit({ id: 1 }), slots: [], displays: [] }));
    await act(async () => {
      await pending.promise;
    });
  });

  it('falls back to manual selector escaping when CSS.escape is unavailable', async () => {
    const root = globalThis as typeof globalThis & { CSS?: { escape?: (input: string) => string } };
    const priorCss = root.CSS;
    const scrollIntoView = vi.fn();
    const priorScrollIntoView = Element.prototype.scrollIntoView;
    try {
      Object.defineProperty(globalThis, 'CSS', { configurable: true, value: undefined });
      Element.prototype.scrollIntoView = scrollIntoView;
      searchParamsValue = new URLSearchParams('highlight=v90078');
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.match(/\/api\/shelves\/(\d+)$/)) {
          return json({
            shelf: bareUnit(),
            slots: [slot({ vn_id: 'v90078', release_id: 'r90078', vn_title: 'Fallback Highlight' })],
            displays: [],
          });
        }
        return json({ shelves: [unit()] });
      }) as unknown as typeof fetch;
      renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />, { locale: 'en' });
      await waitFor(() => expect(screen.getAllByText('Fallback Highlight').length).toBeGreaterThan(0));
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      expect(scrollIntoView).toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'CSS', { configurable: true, value: priorCss });
      Element.prototype.scrollIntoView = priorScrollIntoView;
    }
  });

  it('ignores shelf paging shortcuts when modified, focused in an input, or without shelves', async () => {
    const shelves = [unit({ id: 1, name: 'Studio X' }), unit({ id: 2, name: 'Studio W' })];
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail) return json({ shelf: bareUnit({ id: Number(detail[1]) }), slots: [], displays: [] });
      return json({ shelves });
    }) as unknown as typeof fetch;
    const first = renderWithProviders(<ShelfLayoutEditor initialShelves={shelves} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.keyDown(window, { key: 'ArrowRight', metaKey: true });
    expect(screen.getByRole('tab', { name: /Studio X/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'New shelf' }));
    const input = screen.getByRole('textbox', { name: /Name/ });
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /Studio X/ }).getAttribute('aria-selected')).toBe('true');
    first.unmount();

    renderWithProviders(<ShelfLayoutEditor initialShelves={[]} initialUnplaced={[]} />, { locale: 'en' });
    fireEvent.keyDown(screen.getByRole('tablist', { name: /Pick a shelf/ }), { key: 'Home' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Previous shelf' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Next shelf' }).hasAttribute('disabled')).toBe(true);
  });

  it('does not submit a blank shelf name from the create keyboard handler', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.match(/\/api\/shelves\/(\d+)$/)) return json({ shelf: bareUnit(), slots: [], displays: [] });
      return json({ shelves: [unit()] });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'New shelf' }));
    const input = screen.getByRole('textbox', { name: /Name/ });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/shelves' && init?.method === 'POST')).toBe(false);
  });

  it('ignores duplicate create submissions while the first request is pending', async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/shelves' && init?.method === 'POST') return pending.promise;
      return json({ shelves: [] });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[]} initialUnplaced={[]} />, { locale: 'en' });
    const input = screen.getByRole('textbox', { name: /Name/ });
    fireEvent.change(input, { target: { value: 'Pending shelf' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    const createCalls = fetchMock.mock.calls.filter(([url, init]) => url === '/api/shelves' && init?.method === 'POST');
    expect(createCalls).toHaveLength(1);
    pending.resolve(json({ shelf: bareUnit({ id: 3, name: 'Pending shelf' }) }));
    await act(async () => {
      await pending.promise;
    });
    await waitFor(() => expect(screen.getByRole('tab', { name: /Pending shelf/ })).toBeTruthy());
  });

  it('toasts when shelf creation returns a malformed success payload', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/shelves' && init?.method === 'POST') return json({ ok: true });
      if (url.match(/\/api\/shelves\/(\d+)$/)) return json({ shelf: bareUnit(), slots: [], displays: [] });
      return json({ shelves: [] });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[]} initialUnplaced={[]} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('textbox', { name: /Name/ }), { target: { value: 'Broken shelf' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(document.body.textContent).toContain('Save failed'));
  });

  it('ignores shelf creation completions after unmount', async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/shelves' && init?.method === 'POST') return pending.promise;
      return json({ shelves: [] });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const view = renderWithProviders(<ShelfLayoutEditor initialShelves={[]} initialUnplaced={[]} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('textbox', { name: /Name/ }), { target: { value: 'Unmount create' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/shelves' && init?.method === 'POST')).toBe(true));
    view.unmount();
    pending.resolve(json({ shelf: bareUnit({ id: 9, name: 'Unmount create' }) }));
    await act(async () => {
      await pending.promise;
    });
  });

  it('suppresses shelf creation errors after unmount', async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/shelves' && init?.method === 'POST') return pending.promise;
      return json({ shelves: [] });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const view = renderWithProviders(<ShelfLayoutEditor initialShelves={[]} initialUnplaced={[]} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('textbox', { name: /Name/ }), { target: { value: 'Unmount create error' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/shelves' && init?.method === 'POST')).toBe(true));
    view.unmount();
    pending.resolve(new Response('', { status: 500 }));
    await act(async () => {
      await pending.promise;
    });
    expect(document.body.textContent).not.toContain('Save failed');
  });

  it('uses the generic save message for empty shelf creation errors', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/shelves' && init?.method === 'POST') return new Response('', { status: 500 });
      return json({ shelves: [] });
    }) as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[]} initialUnplaced={[]} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('textbox', { name: /Name/ }), { target: { value: 'Empty create error' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(document.body.textContent).toContain('Save failed'));
  });

  it('toasts when shelf resize returns a malformed success payload', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const detail = url.match(/\/api\/shelves\/(\d+)$/);
      if (detail && init?.method === 'PATCH') return json({ ok: true });
      if (detail) return json({ shelf: bareUnit(), slots: [], displays: [] });
      return json({ shelves: [unit()] });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Add a row' }));
    await waitFor(() => expect(document.body.textContent).toContain('Save failed'));
  });

  it('renames while shelf detail is still loading and reports empty rename errors', async () => {
    const pendingDetail = deferredResponse();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/shelves/1' && !init?.method) return pendingDetail.promise;
      if (url === '/api/shelves/1' && init?.method === 'PATCH') return json({ shelf: bareUnit({ name: 'Renamed without detail' }) });
      return json({ shelves: [unit()] });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const promptDialog = await screen.findByRole('dialog');
    fireEvent.change(screen.getByRole('textbox', { name: 'Rename' }), { target: { value: 'Renamed without detail' } });
    fireEvent.click(within(promptDialog).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/shelves/1' && init?.method === 'PATCH')).toBe(true));
    cleanup();
    pendingDetail.resolve(json({ shelf: bareUnit(), slots: [], displays: [] }));
    await act(async () => {
      await pendingDetail.promise;
    });

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/shelves/1' && init?.method === 'PATCH') return new Response('', { status: 500 });
      if (url === '/api/shelves/1') return json({ shelf: bareUnit(), slots: [], displays: [] });
      return json({ shelves: [unit()] });
    }) as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const errorDialog = await screen.findByRole('dialog');
    fireEvent.change(screen.getByRole('textbox', { name: 'Rename' }), { target: { value: 'Rename empty error' } });
    fireEvent.click(within(errorDialog).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(document.body.textContent).toContain('Save failed'));
  });

  it('ignores rename success and error completions after unmount', async () => {
    for (const status of [200, 500]) {
      cleanup();
      const pending = deferredResponse();
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/shelves/1' && init?.method === 'PATCH') return pending.promise;
        if (url === '/api/shelves/1') return json({ shelf: bareUnit(), slots: [], displays: [] });
        return json({ shelves: [unit()] });
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      const view = renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />, { locale: 'en' });
      await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(screen.getByRole('textbox', { name: 'Rename' }), { target: { value: `Unmount rename ${status}` } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
      await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/shelves/1' && init?.method === 'PATCH')).toBe(true));
      view.unmount();
      pending.resolve(status === 200 ? json({ shelf: bareUnit({ name: `Unmount rename ${status}` }) }) : new Response('', { status }));
      await act(async () => {
        await pending.promise;
      });
    }
  });

  it('resizes without loaded detail, reports empty resize errors, and keeps evicted pool refreshes stale-safe', async () => {
    const pendingDetail = deferredResponse();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/shelves/1' && !init?.method) return pendingDetail.promise;
      if (url === '/api/shelves/1' && init?.method === 'PATCH') return json({ shelf: bareUnit({ rows: 3 }), slots: [], evicted: [] });
      return json({ shelves: [unit()] });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: 'Add a row' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/shelves/1' && init?.method === 'PATCH')).toBe(true));
    cleanup();
    pendingDetail.resolve(json({ shelf: bareUnit(), slots: [], displays: [] }));
    await act(async () => {
      await pendingDetail.promise;
    });

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/shelves/1' && init?.method === 'PATCH') return new Response('', { status: 500 });
      if (url === '/api/shelves/1') return json({ shelf: bareUnit(), slots: [], displays: [] });
      return json({ shelves: [unit()] });
    }) as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Add a row' }));
    await waitFor(() => expect(document.body.textContent).toContain('Save failed'));
  });

  it('ignores resize success and error completions after unmount', async () => {
    for (const status of [200, 500]) {
      cleanup();
      const pending = deferredResponse();
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/shelves/1' && init?.method === 'PATCH') return pending.promise;
        if (url === '/api/shelves/1') return json({ shelf: bareUnit(), slots: [], displays: [] });
        return json({ shelves: [unit()] });
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      const view = renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />, { locale: 'en' });
      await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: 'Add a row' }));
      await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/shelves/1' && init?.method === 'PATCH')).toBe(true));
      view.unmount();
      pending.resolve(status === 200 ? json({ shelf: bareUnit({ rows: 3 }), slots: [], evicted: [] }) : new Response('', { status }));
      await act(async () => {
        await pending.promise;
      });
    }
  });

  it('holds pool refresh while deleting the active shelf and reports empty delete errors', async () => {
    let releasePool!: (value: Response) => void;
    const poolPromise = new Promise<Response>((resolve) => {
      releasePool = resolve;
    });
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/shelves/1' && init?.method === 'DELETE') return json({ ok: true });
      if (url === '/api/shelves?pool=1') return poolPromise;
      if (url === '/api/shelves/1') return json({ shelf: bareUnit(), slots: [], displays: [] });
      return json({ shelves: [unit(), unit({ id: 2, name: 'Second', order_index: 1 })] });
    }) as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit(), unit({ id: 2, name: 'Second', order_index: 1 })]} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('tabpanel')).toBeNull());
    releasePool(json({ shelves: [unit({ id: 2, name: 'Second', order_index: 1 })], unplaced: [] }));
    await act(async () => {
      await poolPromise;
    });
    cleanup();

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/shelves/1' && init?.method === 'DELETE') return new Response('', { status: 500 });
      if (url === '/api/shelves/1') return json({ shelf: bareUnit(), slots: [], displays: [] });
      return json({ shelves: [unit()] });
    }) as unknown as typeof fetch;
    renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />, { locale: 'en' });
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(document.body.textContent).toContain('Save failed'));
  });

  it('ignores delete completion after unmount while the pool refresh is pending', async () => {
    const pendingPool = deferredResponse();
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/shelves/1' && init?.method === 'DELETE') return json({ ok: true });
      if (url === '/api/shelves?pool=1') return pendingPool.promise;
      if (url === '/api/shelves/1') return json({ shelf: bareUnit(), slots: [], displays: [] });
      return json({ shelves: [unit(), unit({ id: 2, name: 'Second', order_index: 1 })] });
    }) as unknown as typeof fetch;
    const view = renderWithProviders(
      <ShelfLayoutEditor initialShelves={[unit(), unit({ id: 2, name: 'Second', order_index: 1 })]} initialUnplaced={[]} />,
      { locale: 'en' },
    );
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('tabpanel')).toBeNull());
    view.unmount();

    pendingPool.resolve(json({ shelves: [unit({ id: 2, name: 'Second', order_index: 1 })], unplaced: [] }));
    await act(async () => {
      await pendingPool.promise;
    });
  });

  it('ignores delete success and error completions after unmount', async () => {
    for (const status of [200, 500]) {
      cleanup();
      const pending = deferredResponse();
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === '/api/shelves/1' && init?.method === 'DELETE') return pending.promise;
        if (url === '/api/shelves/1') return json({ shelf: bareUnit(), slots: [], displays: [] });
        return json({ shelves: [unit()] });
      });
      global.fetch = fetchMock as unknown as typeof fetch;
      const view = renderWithProviders(<ShelfLayoutEditor initialShelves={[unit()]} initialUnplaced={[]} />, { locale: 'en' });
      await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/shelves/1' && init?.method === 'DELETE')).toBe(true));
      view.unmount();
      pending.resolve(status === 200 ? json({ ok: true }) : new Response('', { status }));
      await act(async () => {
        await pending.promise;
      });
    }
  });

  it('renders an unplaced edition without fallback distinguisher text', async () => {
    renderWithProviders(
      <ShelfLayoutEditor
        initialShelves={[unit()]}
        initialUnplaced={[
          poolEntry({
            release_id: 'synthetic:v90001',
            edition_label: null,
            physical_location: [],
            box_type: 'none',
            owned_platform: null,
            rel_platforms: [],
          }),
        ]}
      />,
      { locale: 'en' },
    );
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeTruthy());
    expect(screen.getAllByText('Title Y').length).toBeGreaterThan(0);
    expect(screen.queryByText('synthetic:v90001')).toBeNull();
  });
});
