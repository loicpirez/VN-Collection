// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, within, waitFor, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { SavedFilters, SAVED_FILTERS_OPEN_EVENT } from '@/components/SavedFilters';

const pushMock = vi.fn();
let searchParamsValue = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => searchParamsValue,
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/**
 * Capture the popover DndContext drag-end handler so a reorder can be
 * driven directly: jsdom cannot perform the pointer drag, but
 * `onDragEnd` is a plain function.
 */
const dndHandlers: { onDragEnd?: (e: unknown) => void } = {};

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd?: (e: unknown) => void }) => {
    dndHandlers.onDragEnd = onDragEnd;
    return <div>{children}</div>;
  },
  PointerSensor: function PointerSensor() {},
  KeyboardSensor: function KeyboardSensor() {},
  TouchSensor: function TouchSensor() {},
  closestCenter: () => [],
  useSensor: (s: unknown) => s,
  useSensors: (...s: unknown[]) => s,
}));

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/sortable')>('@dnd-kit/sortable');
  return {
    arrayMove: actual.arrayMove,
    SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    verticalListSortingStrategy: () => null,
    sortableKeyboardCoordinates: () => null,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  };
});

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

function filtersResponse(rows: { id: number; name: string; params: string }[]) {
  return new Response(
    JSON.stringify({ filters: rows.map((r, i) => ({ ...r, position: i, created_at: 1000 + i })) }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

beforeEach(() => {
  pushMock.mockReset();
  dndHandlers.onDragEnd = undefined;
  searchParamsValue = new URLSearchParams('status=completed');
  global.fetch = vi.fn().mockResolvedValue(filtersResponse([]));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SavedFilters', () => {
  it('loads on mount and shows the empty popover state when expanded', async () => {
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/saved-filters', expect.objectContaining({ cache: 'no-store' })));
    await user.click(screen.getByRole('button', { name: /Presets/ }));
    expect(await screen.findByText('No saved presets yet.')).toBeInTheDocument();
  });

  it('renders the saved presets and reflects the active one matching the URL', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      filtersResponse([
        { id: 1, name: 'Done', params: 'status=completed' },
        { id: 2, name: 'Playing', params: 'status=playing' },
      ]),
    );
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    // Active preset name surfaces in the trigger label once loaded.
    expect(await screen.findByRole('button', { name: /Done/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Done/ }));
    const menu = screen.getByRole('menu', { name: 'Presets' });
    expect(within(menu).getByText('Done')).toBeInTheDocument();
    expect(within(menu).getByText('Playing')).toBeInTheDocument();
  });

  it('navigates to a preset when its row is clicked', async () => {
    global.fetch = vi.fn().mockResolvedValue(filtersResponse([{ id: 5, name: 'Planning', params: 'status=planning' }]));
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /Presets/ }));
    await user.click(screen.getByRole('button', { name: /Planning/ }));
    expect(pushMock).toHaveBeenCalledWith('/?status=planning');
  });

  it('saves the current filter combo under a typed name', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      return Promise.resolve(filtersResponse([]));
    });
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /Presets/ }));
    await user.click(screen.getByRole('button', { name: 'Save this filter' }));
    const input = screen.getByPlaceholderText('Preset name...');
    await user.type(input, 'My preset');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toContain('POST /api/saved-filters'));
    const postCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[1]?.method === 'POST');
    expect(JSON.parse(postCall![1].body)).toEqual({ name: 'My preset', params: 'status=completed' });
  });

  it('deletes a preset through its delete control', async () => {
    global.fetch = vi.fn().mockResolvedValue(filtersResponse([{ id: 9, name: 'Trash me', params: 'status=dropped' }]));
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /Presets/ }));
    const row = screen.getByText('Trash me').closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/saved-filters?id=9', expect.objectContaining({ method: 'DELETE' })));
  });

  it('surfaces a load error inside the popover', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'load failed' }), { status: 500, headers: { 'content-type': 'application/json' } }));
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /Presets/ }));
    const menu = await screen.findByRole('menu', { name: 'Presets' });
    expect(await within(menu).findByRole('alert')).toHaveTextContent('load failed');
  });

  it('opens via the SAVED_FILTERS_OPEN_EVENT bus and jumps straight to the save input', async () => {
    renderWithProviders(<SavedFilters triggerHidden />, { locale: 'en' });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    act(() => {
      window.dispatchEvent(new CustomEvent(SAVED_FILTERS_OPEN_EVENT, { detail: { action: 'save' } }));
    });
    expect(await screen.findByPlaceholderText('Preset name...')).toBeInTheDocument();
  });

  it('hides the trigger visually when triggerHidden is set', async () => {
    renderWithProviders(<SavedFilters triggerHidden />, { locale: 'en' });
    const trigger = await screen.findByRole('button', { name: /Presets/ });
    expect(trigger).toHaveClass('sr-only');
  });

  it('PATCHes the reordered ids when a drag-end reorders two presets', async () => {
    const seen: { url: string; method: string; body?: string }[] = [];
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      seen.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
      return Promise.resolve(filtersResponse([
        { id: 1, name: 'First', params: 'status=completed' },
        { id: 2, name: 'Second', params: 'status=playing' },
        { id: 3, name: 'Third', params: 'status=dropped' },
      ]));
    });
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /First/ }));
    await screen.findByText('Third');
    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: 1 }, over: { id: 3 } });
    });
    await waitFor(() => {
      const patch = seen.find((s) => s.method === 'PATCH' && s.url === '/api/saved-filters');
      expect(patch).toBeTruthy();
      expect(JSON.parse(patch!.body!)).toEqual({ ids: [2, 3, 1] });
    });
  });

  it('ignores a drag-end dropped on itself', async () => {
    global.fetch = vi.fn().mockResolvedValue(filtersResponse([
      { id: 1, name: 'First', params: 'status=completed' },
      { id: 2, name: 'Second', params: 'status=playing' },
    ]));
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /First/ }));
    await screen.findByText('Second');
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();
    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: 1 }, over: { id: 1 } });
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses to save when the current params are empty', async () => {
    searchParamsValue = new URLSearchParams();
    global.fetch = vi.fn().mockResolvedValue(filtersResponse([]));
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /Presets/ }));
    // With no active params the save affordance is disabled in the popover.
    const saveButton = screen.getByRole('button', { name: 'Save this filter' });
    expect(saveButton).toBeDisabled();
    expect(screen.getByText('Set a filter first, then come back here to save it.')).toBeInTheDocument();
  });

  it('navigates the popover list with arrow keys', async () => {
    global.fetch = vi.fn().mockResolvedValue(filtersResponse([
      { id: 1, name: 'Alpha', params: 'status=completed' },
      { id: 2, name: 'Beta', params: 'status=playing' },
    ]));
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /Alpha/ }));
    await screen.findByText('Beta');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    });
    // The popover remains open and the menu items are still reachable.
    expect(screen.getByRole('menu', { name: 'Presets' })).toBeInTheDocument();
  });

  it('closes the popover on Escape', async () => {
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /Presets/ }));
    expect(screen.getByRole('menu', { name: 'Presets' })).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Presets' })).not.toBeInTheDocument());
  });
});
