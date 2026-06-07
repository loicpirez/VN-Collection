// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import type { RouteRow } from '@/lib/types';
import type { VndbCharacter } from '@/lib/vndb-types';

const routerMock = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

const characterCacheMock = vi.hoisted(() => ({
  fetchVnCharacters: vi.fn<() => Promise<VndbCharacter[]>>(),
}));

vi.mock('@/lib/vn-characters-cache', () => ({
  fetchVnCharacters: characterCacheMock.fetchVnCharacters,
}));

import { RoutesSection } from '@/components/RoutesSection';

const originalFetch = global.fetch;

function route(overrides: Partial<RouteRow> = {}): RouteRow {
  return {
    id: 1,
    vn_id: 'v90001',
    name: 'Route A',
    completed: false,
    completed_date: null,
    order_index: 0,
    notes: null,
    created_at: 1,
    updated_at: 1,
    ...overrides,
  };
}

function character(overrides: Partial<VndbCharacter> = {}): VndbCharacter {
  return {
    id: 'c90001',
    name: 'Heroine A',
    original: null,
    aliases: [],
    description: null,
    image: null,
    blood_type: null,
    height: null,
    weight: null,
    bust: null,
    waist: null,
    hips: null,
    cup: null,
    age: null,
    birthday: null,
    sex: [null, null],
    gender: [null, null],
    vns: [{ id: 'v90001', role: 'main', spoiler: 0 }],
    traits: [],
    localImage: null,
    ...overrides,
  };
}

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function parseBody(init: RequestInit | undefined): Record<string, unknown> {
  return typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {};
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function deferredCharacters() {
  let resolve!: (value: VndbCharacter[]) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<VndbCharacter[]>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface RoutesServerOptions {
  addStatus?: number;
  patchStatus?: number;
  reorderStatus?: number;
  deleteStatus?: number;
  loadStatus?: number;
  malformedLoad?: boolean;
}

function installRoutesServer(initialRoutes: RouteRow[], opts: RoutesServerOptions = {}) {
  let rows = initialRoutes.map((item) => ({ ...item }));
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';

    if (url === '/api/collection/v90001/routes' && method === 'GET') {
      if (opts.loadStatus && opts.loadStatus >= 400) return json({ error: 'routes-load-failed' }, opts.loadStatus);
      if (opts.malformedLoad) return json({ routes: [{ id: 1 }] });
      return json({ routes: rows });
    }

    if (url === '/api/collection/v90001/routes' && method === 'POST') {
      if (opts.addStatus && opts.addStatus >= 400) return json({ error: 'route-add-failed' }, opts.addStatus);
      const body = parseBody(init);
      const nextId = rows.reduce((max, item) => Math.max(max, item.id), 0) + 1;
      rows = [
        ...rows,
        route({
          id: nextId,
          name: String(body.name ?? ''),
          order_index: rows.length,
          created_at: nextId,
          updated_at: nextId,
        }),
      ];
      return json({ routes: rows });
    }

    if (url === '/api/collection/v90001/routes' && method === 'PATCH') {
      if (opts.reorderStatus && opts.reorderStatus >= 400) return json({ error: 'route-reorder-failed' }, opts.reorderStatus);
      const ids = parseBody(init).ids;
      if (Array.isArray(ids)) {
        const byId = new Map(rows.map((item) => [item.id, item]));
        rows = ids
          .map((id, index) => {
            const item = byId.get(Number(id));
            return item ? { ...item, order_index: index } : null;
          })
          .filter((item): item is RouteRow => item !== null);
      }
      return json({ routes: rows });
    }

    const routePatch = url.match(/\/api\/route\/(\d+)$/);
    if (routePatch && method === 'PATCH') {
      if (opts.patchStatus && opts.patchStatus >= 400) return json({ error: 'route-patch-failed' }, opts.patchStatus);
      const id = Number(routePatch[1]);
      const body = parseBody(init);
      rows = rows.map((item) =>
        item.id === id
          ? {
              ...item,
              ...body,
              completed_date: body.completed === true ? '2026-01-02' : body.completed === false ? null : item.completed_date,
              updated_at: item.updated_at + 1,
            }
          : item,
      );
      return json({ ok: true });
    }

    if (routePatch && method === 'DELETE') {
      if (opts.deleteStatus && opts.deleteStatus >= 400) return json({ error: 'route-delete-failed' }, opts.deleteStatus);
      const id = Number(routePatch[1]);
      rows = rows.filter((item) => item.id !== id);
      return json({ ok: true });
    }

    return json({ ok: true });
  });
  global.fetch = fetchMock;
  return fetchMock;
}

function routeItem(name: string): HTMLElement {
  const item = screen.getByText(name).closest('li');
  if (!item) throw new Error(`Missing route row for ${name}`);
  return item;
}

describe('RoutesSection', () => {
  beforeEach(() => {
    routerMock.refresh.mockClear();
    characterCacheMock.fetchVnCharacters.mockReset();
    characterCacheMock.fetchVnCharacters.mockResolvedValue([]);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders nothing and skips character loading when the VN is outside the collection', () => {
    const fetchMock = installRoutesServer([]);
    const { container } = renderWithProviders(<RoutesSection vnId="v90001" inCollection={false} />);
    expect(container.firstChild).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/collection/v90001/routes', expect.anything());
    expect(characterCacheMock.fetchVnCharacters).not.toHaveBeenCalled();
  });

  it('shows a load error for failed or malformed route payloads', async () => {
    installRoutesServer([], { loadStatus: 500 });
    const { unmount } = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Impossible de charger les routes.')).toBeTruthy();
    unmount();

    installRoutesServer([], { malformedLoad: true });
    renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Impossible de charger les routes.')).toBeTruthy();
  });

  it('renders the empty state, filters suggestions, and ignores blank add submits', async () => {
    const fetchMock = installRoutesServer([]);
    characterCacheMock.fetchVnCharacters.mockResolvedValue([
      character({ id: 'c90001', name: 'Heroine A', original: 'ヒロインA', vns: [{ id: 'v90001', role: 'main', spoiler: 0 }] }),
      character({ id: 'c90002', name: 'Heroine A', vns: [{ id: 'v90001', role: 'primary', spoiler: 0 }] }),
      character({ id: 'c90003', name: '  ', vns: [{ id: 'v90001', role: 'main', spoiler: 0 }] }),
      character({ id: 'c90004', name: 'Other VN Heroine', vns: [{ id: 'v99999', role: 'main', spoiler: 0 }] }),
    ]);
    renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText(/Pas encore de route/)).toBeTruthy();
    expect(await screen.findByText('Heroine A')).toBeTruthy();
    const option = document.querySelector('option[value="Heroine A"]') as HTMLOptionElement | null;
    expect(option?.label).toBe('ヒロインA');
    const form = screen.getByLabelText('Nom de la route (héroïne, route narrative)...').closest('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form as HTMLFormElement);
    expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/collection/v90001/routes' && init?.method === 'POST')).toBe(false);
  });

  it('loads routes, applies suggestions, adds, edits, notes, completes, reorders, and deletes', async () => {
    const fetchMock = installRoutesServer([
      route({ id: 1, name: 'Route A', order_index: 0 }),
      route({ id: 2, name: 'Route B', completed: true, completed_date: '2025-01-02', notes: 'Existing note', order_index: 1 }),
    ]);
    characterCacheMock.fetchVnCharacters.mockResolvedValue([
      character({ id: 'c90001', name: 'Heroine A', vns: [{ id: 'v90001', role: 'main', spoiler: 0 }] }),
      character({ id: 'c90002', name: 'Route A', vns: [{ id: 'v90001', role: 'primary', spoiler: 0 }] }),
      character({ id: 'c90003', name: 'Side Character', vns: [{ id: 'v90001', role: 'side', spoiler: 0 }] }),
    ]);

    renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    expect(screen.getByText('1/2 terminée(s)')).toBeTruthy();
    expect(screen.getByText('Existing note')).toBeTruthy();
    expect(await screen.findByText('Heroine A')).toBeTruthy();
    expect(screen.queryByText('Side Character')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Heroine A' }));
    const addInput = screen.getByLabelText('Nom de la route (héroïne, route narrative)...') as HTMLInputElement;
    expect(addInput.value).toBe('Heroine A');
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(await screen.findByText('Heroine A')).toBeTruthy();
    expect(routerMock.refresh).toHaveBeenCalled();

    const routeA = routeItem('Route A');
    fireEvent.click(within(routeA).getByLabelText('Modifier'));
    const editInput = within(routeA).getByLabelText('Nom de la route (héroïne, route narrative)...');
    fireEvent.change(editInput, { target: { value: 'Route A Edited' } });
    fireEvent.keyDown(editInput, { key: 'Enter' });
    expect(await screen.findByText('Route A Edited')).toBeTruthy();

    const editedRow = routeItem('Route A Edited');
    fireEvent.click(within(editedRow).getByLabelText('Notes de la route'));
    const notesInput = within(editedRow).getByLabelText('Notes sur cette route - déroulement, choix marquants, fin obtenue...');
    fireEvent.change(notesInput, { target: { value: 'Fresh notes' } });
    fireEvent.click(within(editedRow).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Fresh notes')).toBeTruthy();

    const notesRow = routeItem('Route A Edited');
    fireEvent.click(within(notesRow).getByTitle('Marquer terminée'));
    await waitFor(() => expect(screen.getByText('2/3 terminée(s)')).toBeTruthy());

    const completedRow = routeItem('Route A Edited');
    fireEvent.click(within(completedRow).getByLabelText('Descendre'));
    await waitFor(() => {
      const reorder = fetchMock.mock.calls.find(([url, init]) => url === '/api/collection/v90001/routes' && init?.method === 'PATCH');
      expect(parseBody(reorder?.[1]).ids).toEqual([2, 1, 3]);
    });

    fireEvent.click(within(routeItem('Route A Edited')).getByLabelText('Monter'));
    await waitFor(() => {
      const reorderCalls = fetchMock.mock.calls.filter(([url, init]) => url === '/api/collection/v90001/routes' && init?.method === 'PATCH');
      expect(parseBody(reorderCalls[reorderCalls.length - 1]?.[1]).ids).toEqual([1, 2, 3]);
    });

    const deleteRow = routeItem('Heroine A');
    fireEvent.click(within(deleteRow).getByLabelText('Supprimer'));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(within(screen.getByRole('list')).queryByText('Heroine A')).toBeNull());
  });

  it('supports cancelling edits, blur-save, notes cancellation, and delete cancellation', async () => {
    const fetchMock = installRoutesServer([route({ id: 1, name: 'Route A' })]);
    renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();

    const row = routeItem('Route A');
    fireEvent.click(within(row).getByText('Route A'));
    const editInput = within(row).getByLabelText('Nom de la route (héroïne, route narrative)...');
    fireEvent.change(editInput, { target: { value: 'Discarded' } });
    fireEvent.keyDown(editInput, { key: 'ArrowDown' });
    fireEvent.keyDown(editInput, { key: 'Escape' });
    fireEvent.blur(editInput);
    await waitFor(() => expect(screen.getByText('Route A')).toBeTruthy());
    expect(screen.queryByText('Discarded')).toBeNull();

    const rowForBlur = routeItem('Route A');
    fireEvent.click(within(rowForBlur).getByLabelText('Modifier'));
    const blurInput = within(rowForBlur).getByLabelText('Nom de la route (héroïne, route narrative)...');
    fireEvent.change(blurInput, { target: { value: 'Blur Saved' } });
    fireEvent.blur(blurInput);
    await waitFor(() => expect(screen.queryByDisplayValue('Blur Saved')).toBeNull());
    expect(screen.getByText('Blur Saved')).toBeTruthy();

    const blurRow = routeItem('Blur Saved');
    fireEvent.click(within(blurRow).getByLabelText('Notes de la route'));
    fireEvent.change(within(blurRow).getByLabelText('Notes sur cette route - déroulement, choix marquants, fin obtenue...'), {
      target: { value: 'Cancelled notes' },
    });
    fireEvent.click(within(blurRow).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByText('Cancelled notes')).toBeNull();

    const notesToggleRow = routeItem('Blur Saved');
    fireEvent.click(within(notesToggleRow).getByLabelText('Notes de la route'));
    expect(within(notesToggleRow).getByLabelText('Notes sur cette route - déroulement, choix marquants, fin obtenue...')).toBeTruthy();
    fireEvent.click(within(notesToggleRow).getByLabelText('Notes de la route'));
    expect(within(notesToggleRow).queryByLabelText('Notes sur cette route - déroulement, choix marquants, fin obtenue...')).toBeNull();

    const blankEditRow = routeItem('Blur Saved');
    fireEvent.click(within(blankEditRow).getByLabelText('Modifier'));
    const blankEditInput = within(blankEditRow).getByLabelText('Nom de la route (héroïne, route narrative)...');
    fireEvent.change(blankEditInput, { target: { value: '   ' } });
    fireEvent.keyDown(blankEditInput, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('Blur Saved')).toBeTruthy());

    const escapeRow = routeItem('Blur Saved');
    fireEvent.click(within(escapeRow).getByLabelText('Modifier'));
    const escapeInput = within(escapeRow).getByLabelText('Nom de la route (héroïne, route narrative)...');
    fireEvent.change(escapeInput, { target: { value: 'Escape Discarded' } });
    fireEvent.keyDown(escapeInput, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Escape Discarded')).toBeNull());

    fireEvent.click(within(routeItem('Blur Saved')).getByLabelText('Notes de la route'));
    const blankNotes = within(routeItem('Blur Saved')).getByLabelText('Notes sur cette route - déroulement, choix marquants, fin obtenue...');
    fireEvent.change(blankNotes, { target: { value: '   ' } });
    fireEvent.click(within(routeItem('Blur Saved')).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.queryByText('   ')).toBeNull());

    fireEvent.click(within(routeItem('Blur Saved')).getByLabelText('Supprimer'));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('/api/route/1') && init?.method === 'DELETE')).toBe(false);
  });

  it('keeps edit and notes controls open when patch saves fail', async () => {
    installRoutesServer([route({ id: 1, name: 'Route A' })], { patchStatus: 500 });
    renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();

    const editRow = routeItem('Route A');
    fireEvent.click(within(editRow).getByLabelText('Modifier'));
    const editInput = within(editRow).getByLabelText('Nom de la route (héroïne, route narrative)...');
    fireEvent.change(editInput, { target: { value: 'Broken Save' } });
    fireEvent.keyDown(editInput, { key: 'Enter' });
    expect(await screen.findAllByText('route-patch-failed')).toHaveLength(2);
    expect(screen.getByDisplayValue('Broken Save')).toBeTruthy();
    fireEvent.click(within(editRow).getByLabelText('Annuler'));

    const notesRow = routeItem('Route A');
    fireEvent.click(within(notesRow).getByLabelText('Notes de la route'));
    const notesInput = within(notesRow).getByLabelText('Notes sur cette route - déroulement, choix marquants, fin obtenue...');
    fireEvent.change(notesInput, { target: { value: 'Broken notes' } });
    fireEvent.click(within(notesRow).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.getAllByText('route-patch-failed').length).toBeGreaterThanOrEqual(2));
    expect(screen.getByDisplayValue('Broken notes')).toBeTruthy();
  });

  it('ignores duplicate patch, remove, and move requests while a mutation is pending', async () => {
    let patchRows = [route({ id: 1, name: 'Route A' })];
    let patchCount = 0;
    const patchResponse = deferredResponse();
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/collection/v90001/routes' && method === 'GET') return Promise.resolve(json({ routes: patchRows }));
      if (url === '/api/route/1' && method === 'PATCH') {
        patchCount += 1;
        return patchResponse.promise;
      }
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch;
    const patchView = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    const toggle = within(routeItem('Route A')).getByTitle('Marquer terminée');
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    await waitFor(() => expect(patchCount).toBe(1));
    patchRows = [route({ id: 1, name: 'Route A', completed: true, completed_date: '2026-01-02' })];
    await act(async () => {
      patchResponse.resolve(json({ ok: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    patchView.unmount();

    let removeRows = [route({ id: 1, name: 'Route A' })];
    let removeCount = 0;
    const removeResponse = deferredResponse();
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/collection/v90001/routes' && method === 'GET') return Promise.resolve(json({ routes: removeRows }));
      if (url === '/api/route/1' && method === 'DELETE') {
        removeCount += 1;
        return removeResponse.promise;
      }
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch;
    const removeView = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    const removeButton = within(routeItem('Route A')).getByLabelText('Supprimer');
    fireEvent.click(removeButton);
    fireEvent.click(removeButton);
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(removeCount).toBe(1));
    removeRows = [];
    await act(async () => {
      removeResponse.resolve(json({ ok: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    removeView.unmount();

    let moveRows = [
      route({ id: 1, name: 'Route A', order_index: 0 }),
      route({ id: 2, name: 'Route B', order_index: 1 }),
    ];
    let moveCount = 0;
    const moveResponse = deferredResponse();
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/collection/v90001/routes' && method === 'GET') return Promise.resolve(json({ routes: moveRows }));
      if (url === '/api/collection/v90001/routes' && method === 'PATCH') {
        moveCount += 1;
        return moveResponse.promise;
      }
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch;
    renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    const moveButton = within(routeItem('Route A')).getByLabelText('Descendre');
    fireEvent.click(moveButton);
    fireEvent.click(moveButton);
    await waitFor(() => expect(moveCount).toBe(1));
    moveRows = [
      route({ id: 2, name: 'Route B', order_index: 0 }),
      route({ id: 1, name: 'Route A', order_index: 1 }),
    ];
    await act(async () => {
      moveResponse.resolve(json({ routes: moveRows }));
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('ignores duplicate edit saves while the first patch is pending', async () => {
    const patchResponse = deferredResponse();
    let patchCount = 0;
    let rows = [route({ id: 1, name: 'Route A' })];
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/collection/v90001/routes' && method === 'GET') return Promise.resolve(json({ routes: rows }));
      if (url === '/api/route/1' && method === 'PATCH') {
        patchCount += 1;
        return patchResponse.promise;
      }
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch;
    renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    const editRow = routeItem('Route A');
    fireEvent.click(within(editRow).getByLabelText('Modifier'));
    const input = within(editRow).getByLabelText('Nom de la route (héroïne, route narrative)...');
    fireEvent.change(input, { target: { value: 'Route A Edited' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    await waitFor(() => expect(patchCount).toBe(1));
    rows = [route({ id: 1, name: 'Route A Edited' })];
    await act(async () => {
      patchResponse.resolve(json({ ok: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(await screen.findByText('Route A Edited')).toBeTruthy();
  });

  it('surfaces add, patch, reorder, and delete failures without losing current rows', async () => {
    const addFetch = installRoutesServer([route({ id: 1, name: 'Route A' })], { addStatus: 500 });
    const { unmount } = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nom de la route (héroïne, route narrative)...'), { target: { value: 'Broken Add' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(await screen.findAllByText('route-add-failed')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Nom de la route (héroïne, route narrative)...'), { target: { value: 'Clear error' } });
    await waitFor(() => expect(screen.queryAllByText('route-add-failed')).toHaveLength(1));
    expect(addFetch).toHaveBeenCalled();
    unmount();

    installRoutesServer([route({ id: 1, name: 'Route A' })], { patchStatus: 500 });
    const patchRender = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    fireEvent.click(within(routeItem('Route A')).getByTitle('Marquer terminée'));
    expect(await screen.findAllByText('route-patch-failed')).toHaveLength(2);
    patchRender.unmount();

    installRoutesServer([route({ id: 1, name: 'Route A' }), route({ id: 2, name: 'Route B', order_index: 1 })], { reorderStatus: 500 });
    const reorderRender = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    fireEvent.click(within(routeItem('Route A')).getByLabelText('Descendre'));
    expect(await screen.findAllByText('route-reorder-failed')).toHaveLength(2);
    expect(screen.getByText('Route A')).toBeTruthy();
    reorderRender.unmount();

    installRoutesServer([route({ id: 1, name: 'Route A' })], { deleteStatus: 500 });
    renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    fireEvent.click(within(routeItem('Route A')).getByLabelText('Supprimer'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirmer' }));
    expect(await screen.findAllByText('route-delete-failed')).toHaveLength(2);
    expect(screen.getByText('Route A')).toBeTruthy();
  });

  it('paginates long route lists', async () => {
    installRoutesServer(
      Array.from({ length: 41 }, (_, index) =>
        route({ id: index + 1, name: `Route ${index + 1}`, order_index: index }),
      ),
    );
    renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route 1')).toBeTruthy();
    expect(screen.queryByText('Route 41')).toBeNull();
    expect(screen.getByText('Routes 1-40 / 41')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(await screen.findByText('Route 41')).toBeTruthy();
    expect(screen.getByText('Routes 41-41 / 41')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }));
    expect(await screen.findByText('Route 1')).toBeTruthy();
  }, 30000);

  it('clamps the current page after deleting the only row on the last page', async () => {
    installRoutesServer(
      Array.from({ length: 41 }, (_, index) =>
        route({ id: index + 1, name: `Route ${index + 1}`, order_index: index }),
      ),
    );
    renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(await screen.findByText('Route 41')).toBeTruthy();
    fireEvent.click(within(routeItem('Route 41')).getByLabelText('Supprimer'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(screen.queryByText('Route 41')).toBeNull());
    expect(screen.getByText('Route 1')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Pagination des routes' })).toBeNull();
  }, 10000);

  it('ignores route and character loads that settle after unmount', async () => {
    const routesLoad = deferredResponse();
    const charsLoad = deferredCharacters();
    characterCacheMock.fetchVnCharacters.mockReturnValue(charsLoad.promise);
    global.fetch = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      if (String(input) === '/api/collection/v90001/routes') return routesLoad.promise;
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch;

    const view = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    view.unmount();
    await act(async () => {
      routesLoad.resolve(json({ routes: [route({ id: 1, name: 'Late Route' })] }));
      charsLoad.resolve([character({ id: 'c-late', name: 'Late Character' })]);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('Late Route')).toBeNull();
    expect(screen.queryByText('Late Character')).toBeNull();
  });

  it('ignores aborted route and character load failures', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    characterCacheMock.fetchVnCharacters.mockRejectedValue(abortError);
    global.fetch = vi.fn(async () => {
      throw abortError;
    });
    const { unmount } = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    unmount();
    await Promise.resolve();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('blocks duplicate adds and ignores stale add completions', async () => {
    const addResponse = deferredResponse();
    let postCount = 0;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/collection/v90001/routes' && method === 'GET') return Promise.resolve(json({ routes: [] }));
      if (url === '/api/collection/v90001/routes' && method === 'POST') {
        postCount += 1;
        return addResponse.promise;
      }
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch;
    const view = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    await screen.findByText(/Pas encore de route/);
    const input = screen.getByLabelText('Nom de la route (héroïne, route narrative)...');
    fireEvent.change(input, { target: { value: 'Pending Route' } });
    const form = input.closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(postCount).toBe(1));
    view.unmount();
    await act(async () => {
      addResponse.resolve(json({ routes: [route({ id: 1, name: 'Pending Route' })] }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('Pending Route')).toBeNull();
  });

  it('surfaces malformed add responses', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/collection/v90001/routes' && method === 'GET') return Promise.resolve(json({ routes: [] }));
      if (url === '/api/collection/v90001/routes' && method === 'POST') return Promise.resolve(json({ routes: [{ id: 1 }] }));
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch;
    renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    await screen.findByText(/Pas encore de route/);
    fireEvent.change(screen.getByLabelText('Nom de la route (héroïne, route narrative)...'), { target: { value: 'Malformed Route' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(screen.getAllByText('Erreur').length).toBeGreaterThanOrEqual(2));
  });

  it('ignores stale add failures after unmount', async () => {
    const addResponse = deferredResponse();
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/collection/v90001/routes' && method === 'GET') return Promise.resolve(json({ routes: [] }));
      if (url === '/api/collection/v90001/routes' && method === 'POST') return addResponse.promise;
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch;
    const view = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    await screen.findByText(/Pas encore de route/);
    fireEvent.change(screen.getByLabelText('Nom de la route (héroïne, route narrative)...'), { target: { value: 'Late add' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    view.unmount();
    await act(async () => {
      addResponse.reject(new Error('late-add-failed'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('late-add-failed')).toBeNull();
  });

  it('ignores stale patch completions and failures after unmount', async () => {
    const patchResponse = deferredResponse();
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/collection/v90001/routes' && method === 'GET') {
        return Promise.resolve(json({ routes: [route({ id: 1, name: 'Route A' })] }));
      }
      if (url === '/api/route/1' && method === 'PATCH') return patchResponse.promise;
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch;
    const completeView = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    fireEvent.click(within(routeItem('Route A')).getByTitle('Marquer terminée'));
    completeView.unmount();
    await act(async () => {
      patchResponse.resolve(json({ ok: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const patchFailure = deferredResponse();
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/collection/v90001/routes' && method === 'GET') {
        return Promise.resolve(json({ routes: [route({ id: 1, name: 'Route A' })] }));
      }
      if (url === '/api/route/1' && method === 'PATCH') return patchFailure.promise;
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch;
    const failureView = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    fireEvent.click(within(routeItem('Route A')).getByTitle('Marquer terminée'));
    failureView.unmount();
    await act(async () => {
      patchFailure.reject(new Error('late-patch-failed'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('late-patch-failed')).toBeNull();
  });

  it('ignores stale patch, remove, and move reload completions', async () => {
    let patchGetCount = 0;
    const patchReload = deferredResponse();
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/collection/v90001/routes' && method === 'GET') {
        patchGetCount += 1;
        return patchGetCount === 1
          ? Promise.resolve(json({ routes: [route({ id: 1, name: 'Route A' })] }))
          : patchReload.promise;
      }
      if (url === '/api/route/1' && method === 'PATCH') return Promise.resolve(json({ ok: true }));
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch;
    const patchView = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    fireEvent.click(within(routeItem('Route A')).getByTitle('Marquer terminée'));
    await waitFor(() => expect(patchGetCount).toBe(2));
    patchView.unmount();
    await act(async () => {
      patchReload.resolve(json({ routes: [route({ id: 1, name: 'Route A', completed: true })] }));
      await Promise.resolve();
      await Promise.resolve();
    });

    let removeGetCount = 0;
    const removeReload = deferredResponse();
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/collection/v90001/routes' && method === 'GET') {
        removeGetCount += 1;
        return removeGetCount === 1
          ? Promise.resolve(json({ routes: [route({ id: 1, name: 'Route A' })] }))
          : removeReload.promise;
      }
      if (url === '/api/route/1' && method === 'DELETE') return Promise.resolve(json({ ok: true }));
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch;
    const removeView = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    fireEvent.click(within(routeItem('Route A')).getByLabelText('Supprimer'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(removeGetCount).toBe(2));
    removeView.unmount();
    await act(async () => {
      removeReload.resolve(json({ routes: [] }));
      await Promise.resolve();
      await Promise.resolve();
    });

    let moveGetCount = 0;
    const moveReload = deferredResponse();
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/collection/v90001/routes' && method === 'GET') {
        moveGetCount += 1;
        return moveGetCount === 1
          ? Promise.resolve(json({ routes: [route({ id: 1, name: 'Route A' }), route({ id: 2, name: 'Route B', order_index: 1 })] }))
          : moveReload.promise;
      }
      if (url === '/api/collection/v90001/routes' && method === 'PATCH') return Promise.resolve(json({ routes: [] }));
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch;
    const moveView = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    fireEvent.click(within(routeItem('Route A')).getByLabelText('Descendre'));
    await waitFor(() => expect(moveGetCount).toBe(2));
    moveView.unmount();
    await act(async () => {
      moveReload.resolve(json({ routes: [route({ id: 2, name: 'Route B' }), route({ id: 1, name: 'Route A', order_index: 1 })] }));
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('ignores stale remove and move completions or failures after unmount', async () => {
    const removeResponse = deferredResponse();
    let removeStarted = 0;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/collection/v90001/routes' && method === 'GET') {
        return Promise.resolve(json({ routes: [route({ id: 1, name: 'Route A' })] }));
      }
      if (url === '/api/route/1' && method === 'DELETE') {
        removeStarted += 1;
        return removeResponse.promise;
      }
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch;
    const removeView = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    fireEvent.click(within(routeItem('Route A')).getByLabelText('Supprimer'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(removeStarted).toBe(1));
    removeView.unmount();
    await act(async () => {
      removeResponse.resolve(json({ ok: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const removeFailure = deferredResponse();
    let removeFailureStarted = 0;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/collection/v90001/routes' && method === 'GET') {
        return Promise.resolve(json({ routes: [route({ id: 1, name: 'Route A' })] }));
      }
      if (url === '/api/route/1' && method === 'DELETE') {
        removeFailureStarted += 1;
        return removeFailure.promise;
      }
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch;
    const removeFailureView = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    fireEvent.click(within(routeItem('Route A')).getByLabelText('Supprimer'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(removeFailureStarted).toBe(1));
    removeFailureView.unmount();
    await act(async () => {
      removeFailure.reject(new Error('late-remove-failed'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('late-remove-failed')).toBeNull();

    const moveResponse = deferredResponse();
    let moveStarted = 0;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/collection/v90001/routes' && method === 'GET') {
        return Promise.resolve(json({ routes: [route({ id: 1, name: 'Route A' }), route({ id: 2, name: 'Route B', order_index: 1 })] }));
      }
      if (url === '/api/collection/v90001/routes' && method === 'PATCH') {
        moveStarted += 1;
        return moveResponse.promise;
      }
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch;
    const moveView = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    fireEvent.click(within(routeItem('Route A')).getByLabelText('Descendre'));
    await waitFor(() => expect(moveStarted).toBe(1));
    moveView.unmount();
    await act(async () => {
      moveResponse.resolve(json({ ok: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const moveFailure = deferredResponse();
    let moveFailureStarted = 0;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/collection/v90001/routes' && method === 'GET') {
        return Promise.resolve(json({ routes: [route({ id: 1, name: 'Route A' }), route({ id: 2, name: 'Route B', order_index: 1 })] }));
      }
      if (url === '/api/collection/v90001/routes' && method === 'PATCH') {
        moveFailureStarted += 1;
        return moveFailure.promise;
      }
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch;
    const moveFailureView = renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    fireEvent.click(within(routeItem('Route A')).getByLabelText('Descendre'));
    await waitFor(() => expect(moveFailureStarted).toBe(1));
    moveFailureView.unmount();
    await act(async () => {
      moveFailure.reject(new Error('late-move-failed'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.queryByText('late-move-failed')).toBeNull();
  });

  it('logs character suggestion failures without blocking route rendering', async () => {
    const error = new Error('characters-down');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    characterCacheMock.fetchVnCharacters.mockRejectedValue(error);
    installRoutesServer([route({ id: 1, name: 'Route A' })]);
    renderWithProviders(<RoutesSection vnId="v90001" inCollection />);
    expect(await screen.findByText('Route A')).toBeTruthy();
    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('[RoutesSection] characters fetch failed:', error));
  });
});
