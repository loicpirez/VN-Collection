// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import type { ShelfUnit, ShelfUnitWithCount } from '@/lib/db';

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
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
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
    // A 1x1 shelf cannot shrink further; the no-op clamp short-circuits.
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
    // No PATCH issued because cols/rows are already clamped at the floor.
    const patches = fetchMock.mock.calls.filter(([, i]) => (i as RequestInit)?.method === 'PATCH');
    expect(patches).toHaveLength(0);
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
});
