// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, within, waitFor, act } from '@testing-library/react';
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
const sortableState = vi.hoisted(() => ({ isDragging: false }));
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
    useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, transition: undefined, isDragging: sortableState.isDragging }),
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
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  pushMock.mockReset();
  dndHandlers.onDragEnd = undefined;
  sortableState.isDragging = false;
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

  it('opens from the event bus without save mode and closes on outside click', async () => {
    renderWithProviders(<SavedFilters />, { locale: 'en' });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    act(() => {
      window.dispatchEvent(new CustomEvent('vn:open-saved-filters'));
    });
    expect(await screen.findByRole('menu', { name: 'Presets' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Preset name...')).toBeNull();
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Presets' })).not.toBeInTheDocument());
  });

  it('moves keyboard focus through enabled popover buttons', async () => {
    global.fetch = vi.fn().mockResolvedValue(filtersResponse([
      { id: 1, name: 'First', params: 'status=completed' },
      { id: 2, name: 'Second', params: 'status=playing' },
    ]));
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /First/ }));
    const firstButton = screen.getAllByRole('button', { name: 'Drag to reorder' })[0]!;
    firstButton.focus();
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(document.activeElement).not.toBe(firstButton);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save this filter' }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    });
    expect(document.activeElement).toBe(firstButton);
  });

  it('ignores roving-focus keys while the popover is still loading', async () => {
    const load = deferred<Response>();
    global.fetch = vi.fn().mockReturnValue(load.promise);
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: /Presets/ }));
    expect(screen.getByRole('menu', { name: 'Presets' })).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    });
    load.resolve(filtersResponse([]));
    await screen.findByText('No saved presets yet.');
  });

  it('surfaces invalid load payloads and ignores AbortError loads', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ filters: 'bad' }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const { user, unmount } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /Presets/ }));
    const menu = await screen.findByRole('menu', { name: 'Presets' });
    expect(await within(menu).findByRole('alert')).toHaveTextContent('Error');
    unmount();

    renderWithProviders(<SavedFilters />, { locale: 'en' });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(document.body.textContent).not.toContain('aborted');
  });

  it('keeps save inert for blank names and reports empty params from remote save mode', async () => {
    searchParamsValue = new URLSearchParams();
    const calls: string[] = [];
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      return Promise.resolve(filtersResponse([]));
    });
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    act(() => {
      window.dispatchEvent(new CustomEvent('vn:open-saved-filters', { detail: { action: 'save' } }));
    });
    await screen.findByPlaceholderText('Preset name...');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(calls).toEqual(['GET /api/saved-filters']);
    await user.type(screen.getByPlaceholderText('Preset name...'), 'No params');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(document.body.textContent).toContain('Set a filter first'));
    expect(calls).toEqual(['GET /api/saved-filters']);
  });

  it('sorts saved params and excludes page when saving', async () => {
    searchParamsValue = new URLSearchParams('z=last&page=9&a=first');
    let postBody = '';
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') postBody = init.body as string;
      return Promise.resolve(filtersResponse([]));
    });
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /Presets/ }));
    await user.click(screen.getByRole('button', { name: 'Save this filter' }));
    await user.type(screen.getByPlaceholderText('Preset name...'), 'Sorted');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(postBody).not.toBe(''));
    expect(JSON.parse(postBody)).toEqual({ name: 'Sorted', params: 'a=first&z=last' });
  });

  it('drops stale load, save, delete, and reorder failures after unmount', async () => {
    const initialLoad = deferred<Response>();
    const savePost = deferred<Response>();
    const deleteCall = deferred<Response>();
    const reorderPatch = deferred<Response>();
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return savePost.promise;
      if (init?.method === 'DELETE') return deleteCall.promise;
      if (init?.method === 'PATCH') return reorderPatch.promise;
      if (url === '/api/saved-filters') return initialLoad.promise;
      return Promise.resolve(filtersResponse([]));
    });

    const first = renderWithProviders(<SavedFilters />, { locale: 'en' });
    first.unmount();
    initialLoad.reject(new Error('late load'));
    await Promise.resolve();

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return savePost.promise;
      return Promise.resolve(filtersResponse([]));
    });
    const saveRender = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await saveRender.user.click(await screen.findByRole('button', { name: /Presets/ }));
    await saveRender.user.click(screen.getByRole('button', { name: 'Save this filter' }));
    await saveRender.user.type(screen.getByPlaceholderText('Preset name...'), 'Late save');
    await saveRender.user.click(screen.getByRole('button', { name: 'Save' }));
    saveRender.unmount();
    savePost.reject(new Error('late save'));
    await Promise.resolve();

    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return deleteCall.promise;
      if (init?.method === 'PATCH') return reorderPatch.promise;
      return Promise.resolve(filtersResponse([
        { id: 1, name: 'First', params: 'status=completed' },
        { id: 2, name: 'Second', params: 'status=playing' },
      ]));
    });
    const mutationRender = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await mutationRender.user.click(await screen.findByRole('button', { name: /First/ }));
    const mutationMenu = screen.getByRole('menu', { name: 'Presets' });
    const row = within(mutationMenu).getByText('First').closest('li') as HTMLElement;
    await mutationRender.user.click(within(row).getByRole('button', { name: 'Delete' }));
    mutationRender.unmount();
    deleteCall.reject(new Error('late delete'));
    await Promise.resolve();

    const reorderRender = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await reorderRender.user.click(await screen.findByRole('button', { name: /First/ }));
    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: 1 }, over: { id: 2 } });
    });
    reorderRender.unmount();
    reorderPatch.reject(new Error('late reorder'));
    await Promise.resolve();
  });

  it('drops stale load, save, delete, and reorder successes after unmount', async () => {
    const initialLoad = deferred<Response>();
    const savePost = deferred<Response>();
    const deleteCall = deferred<Response>();
    const reorderPatch = deferred<Response>();

    global.fetch = vi.fn().mockReturnValue(initialLoad.promise);
    const first = renderWithProviders(<SavedFilters />, { locale: 'en' });
    first.unmount();
    initialLoad.resolve(filtersResponse([{ id: 1, name: 'Late', params: 'status=completed' }]));
    await Promise.resolve();

    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return savePost.promise;
      return Promise.resolve(filtersResponse([]));
    });
    const saveRender = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await saveRender.user.click(await screen.findByRole('button', { name: /Presets/ }));
    await saveRender.user.click(screen.getByRole('button', { name: 'Save this filter' }));
    await saveRender.user.type(screen.getByPlaceholderText('Preset name...'), 'Late save');
    await saveRender.user.click(screen.getByRole('button', { name: 'Save' }));
    saveRender.unmount();
    savePost.resolve(filtersResponse([]));
    await Promise.resolve();

    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return deleteCall.promise;
      if (init?.method === 'PATCH') return reorderPatch.promise;
      return Promise.resolve(filtersResponse([
        { id: 1, name: 'First', params: 'status=completed' },
        { id: 2, name: 'Second', params: 'status=playing' },
      ]));
    });
    const deleteRender = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await deleteRender.user.click(await screen.findByRole('button', { name: /First/ }));
    const deleteMenu = screen.getByRole('menu', { name: 'Presets' });
    const row = within(deleteMenu).getByText('First').closest('li') as HTMLElement;
    await deleteRender.user.click(within(row).getByRole('button', { name: 'Delete' }));
    deleteRender.unmount();
    deleteCall.resolve(filtersResponse([]));
    await Promise.resolve();

    const reorderRender = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await reorderRender.user.click(await screen.findByRole('button', { name: /First/ }));
    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: 1 }, over: { id: 2 } });
    });
    reorderRender.unmount();
    reorderPatch.resolve(filtersResponse([]));
    await Promise.resolve();
  });

  it('blocks duplicate save and delete submissions while the first mutation is pending', async () => {
    const savePost = deferred<Response>();
    const deleteCall = deferred<Response>();
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return savePost.promise;
      if (init?.method === 'DELETE') return deleteCall.promise;
      return Promise.resolve(filtersResponse([{ id: 9, name: 'Trash me', params: 'status=dropped' }]));
    });
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /Presets/ }));
    await user.click(screen.getByRole('button', { name: 'Save this filter' }));
    await user.type(screen.getByPlaceholderText('Preset name...'), 'Pending');
    const saveButton = screen.getByRole('button', { name: 'Save' });
    act(() => {
      fireEvent.click(saveButton);
      fireEvent.click(saveButton);
    });
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    savePost.resolve(filtersResponse([]));
    await waitFor(() => expect(screen.queryByPlaceholderText('Preset name...')).toBeNull());

    const row = within(screen.getByRole('menu', { name: 'Presets' })).getByText('Trash me').closest('li') as HTMLElement;
    const deleteButton = within(row).getByRole('button', { name: 'Delete' });
    act(() => {
      fireEvent.click(deleteButton);
      fireEvent.click(deleteButton);
    });
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1);
    deleteCall.resolve(filtersResponse([]));
  });

  it('renders the dragging row state from sortable metadata', async () => {
    sortableState.isDragging = true;
    global.fetch = vi.fn().mockResolvedValue(filtersResponse([{ id: 1, name: 'First', params: 'status=completed' }]));
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /First/ }));
    const row = within(screen.getByRole('menu', { name: 'Presets' })).getByText('First').closest('li') as HTMLElement;
    expect(row.className).toContain('bg-bg-elev');
    expect(row.className).toContain('shadow-card');
  });

  it('ignores drag-end while busy, without an over target, or with an unknown over id', async () => {
    const patch = deferred<Response>();
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return patch.promise;
      return Promise.resolve(filtersResponse([
        { id: 1, name: 'First', params: 'status=completed' },
        { id: 2, name: 'Second', params: 'status=playing' },
      ]));
    });
    const { user } = renderWithProviders(<SavedFilters />, { locale: 'en' });
    await user.click(await screen.findByRole('button', { name: /First/ }));
    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: 1 }, over: { id: 2 } });
      dndHandlers.onDragEnd?.({ active: { id: 2 }, over: { id: 1 } });
    });
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1);
    patch.resolve(filtersResponse([]));
    await waitFor(() => expect(document.body.textContent).not.toContain('Saving'));

    (global.fetch as ReturnType<typeof vi.fn>).mockClear();
    act(() => {
      dndHandlers.onDragEnd?.({ active: { id: 1 }, over: null });
      dndHandlers.onDragEnd?.({ active: { id: 1 }, over: { id: 999 } });
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
