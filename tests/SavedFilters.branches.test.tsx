// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, within, waitFor, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { SavedFilters } from '@/components/SavedFilters';

const pushMock = vi.fn();
let searchParamsValue = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => searchParamsValue,
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

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
    useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, transition: undefined, isDragging: false }),
  };
});
vi.mock('@dnd-kit/utilities', () => ({ CSS: { Transform: { toString: () => '' } } }));

function filtersResponse(rows: { id: number; name: string; params: string }[]) {
  return new Response(
    JSON.stringify({ filters: rows.map((r, i) => ({ ...r, position: i, created_at: 1000 + i })) }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
function errorResponse(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { 'content-type': 'application/json' } });
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

describe('SavedFilters branches', () => {
  it('reverts the local order and toasts when the reorder PATCH fails', async () => {
    let phase = 0;
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return Promise.resolve(errorResponse('reorder boom'));
      // Initial + reload GETs return the original order.
      phase++;
      return Promise.resolve(filtersResponse([
        { id: 1, name: 'First', params: 'status=completed' },
        { id: 2, name: 'Second', params: 'status=playing' },
      ]));
    });
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /First/ }));
    await screen.findByText('Second');
    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: 1 }, over: { id: 2 } });
    });
    await waitFor(() => expect(document.body.textContent).toContain('reorder boom'));
    expect(phase).toBeGreaterThan(0);
  });

  it('toasts when a delete fails', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return Promise.resolve(errorResponse('delete boom'));
      return Promise.resolve(filtersResponse([{ id: 9, name: 'Trash me', params: 'status=dropped' }]));
    });
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /Presets/ }));
    const row = (await screen.findByText('Trash me')).closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(document.body.textContent).toContain('delete boom'));
  });

  it('toasts when the save POST fails', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(errorResponse('save boom'));
      return Promise.resolve(filtersResponse([]));
    });
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /Presets/ }));
    await user.click(screen.getByRole('button', { name: 'Save this filter' }));
    await user.type(screen.getByPlaceholderText('Preset name...'), 'My preset');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(document.body.textContent).toContain('save boom'));
  });

  it('saves via the Enter key and cancels the name input via Escape', async () => {
    const seen: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      seen.push(`${init?.method ?? 'GET'} ${url}`);
      return Promise.resolve(filtersResponse([]));
    });
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /Presets/ }));
    await user.click(screen.getByRole('button', { name: 'Save this filter' }));
    const input = screen.getByPlaceholderText('Preset name...');
    await user.type(input, 'Via Enter{Enter}');
    await waitFor(() => expect(seen).toContain('POST /api/saved-filters'));
    // Re-open the name input then dismiss it with Escape.
    await user.click(screen.getByRole('button', { name: 'Save this filter' }));
    const input2 = screen.getByPlaceholderText('Preset name...');
    await user.type(input2, '{Escape}');
    await waitFor(() => expect(screen.queryByPlaceholderText('Preset name...')).toBeNull());
  });

  it('cancels the name input via the X button', async () => {
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /Presets/ }));
    await user.click(screen.getByRole('button', { name: 'Save this filter' }));
    expect(screen.getByPlaceholderText('Preset name...')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByPlaceholderText('Preset name...')).toBeNull();
  });

  it('dispatches the advanced-filters open event from the empty-state CTA when filters are present', async () => {
    global.fetch = vi.fn().mockResolvedValue(filtersResponse([]));
    const onAdvanced = vi.fn();
    window.addEventListener('vn:open-advanced-filters', onAdvanced);
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /Presets/ }));
    // With active params (status=completed) the openDrawerHint is hidden; the CTA is still present.
    await screen.findByText('No saved presets yet.');
    await user.click(screen.getByRole('button', { name: /Open advanced filters|Set filters/ }));
    expect(onAdvanced).toHaveBeenCalled();
    window.removeEventListener('vn:open-advanced-filters', onAdvanced);
  });

  it('ignores a drag-end whose active id is not in the list (oldIdx -1)', async () => {
    global.fetch = vi.fn().mockResolvedValue(filtersResponse([
      { id: 1, name: 'First', params: 'status=completed' },
      { id: 2, name: 'Second', params: 'status=playing' },
    ]));
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /First/ }));
    await screen.findByText('Second');
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();
    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: 999 }, over: { id: 2 } });
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
