// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { ListsPickerButton } from '@/components/ListsPickerButton';
import { dictionaries } from '@/lib/i18n/dictionaries';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: mocks.refresh, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  let reject!: (reason?: Error | string) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function list(id: number, name: string, color: string | null = null) {
  return { id, name, color, pinned: 0 };
}

interface Handlers {
  lists?: () => Response | Promise<Response>;
  memberships?: () => Response | Promise<Response>;
  create?: (body: unknown) => Response | Promise<Response>;
  items?: (method: string, url: string, body: unknown) => Response | Promise<Response>;
}

function installFetch(h: Handlers) {
  global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    if (u === '/api/lists' && method === 'GET') return h.lists ? h.lists() : json({ lists: [list(1, 'Studio X'), list(2, 'Title Y')] });
    if (u === '/api/lists' && method === 'POST') return h.create ? h.create(JSON.parse(String(init!.body))) : json({ list: list(9, 'Created') });
    if (u.startsWith('/api/vn/') && u.endsWith('/lists')) return h.memberships ? h.memberships() : json({ lists: [] });
    if (u.includes('/items')) return h.items ? h.items(method, u, init?.body ? JSON.parse(String(init.body)) : null) : json({ ok: true });
    return json({});
  });
}

function renderBtn(props: Partial<React.ComponentProps<typeof ListsPickerButton>> = {}) {
  return renderWithProviders(<ListsPickerButton vnId="v90001" {...props} />, { locale: 'en' });
}

async function openPopover() {
  fireEvent.click(screen.getByRole('button', { name: t.lists.addToListAria }));
  return screen.findByRole('menu');
}

describe('ListsPickerButton branches', () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    installFetch({});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('opens the popover lazily and lists the available lists', async () => {
    renderBtn();
    const menu = await openPopover();
    expect(await within(menu).findByText('Studio X')).toBeInTheDocument();
    expect(within(menu).getByText('Title Y')).toBeInTheDocument();
  });

  it('renders the inline variant with the card chip label and a count chip', async () => {
    renderBtn({ variant: 'inline', initialMemberCount: 3 });
    const trigger = screen.getByRole('button', { name: t.lists.addToListAria });
    expect(within(trigger).getByText(t.lists.cardChip)).toBeInTheDocument();
    // The count chip reflects initialMemberCount before any fetch.
    expect(within(trigger).getByText('3')).toBeInTheDocument();
  });

  it('closes again when the trigger is clicked while open', async () => {
    renderBtn();
    await openPopover();
    fireEvent.click(screen.getByRole('button', { name: t.lists.addToListAria }));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('reopens with cached lists without loading again', async () => {
    renderBtn();
    await openPopover();
    await screen.findByText('Studio X');
    fireEvent.click(screen.getByRole('button', { name: t.lists.addToListAria }));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: t.lists.addToListAria }));
    expect(await screen.findByText('Studio X')).toBeInTheDocument();
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === '/api/lists')).toHaveLength(1);
  });

  it('closes via the in-popover close button', async () => {
    renderBtn();
    const menu = await openPopover();
    fireEvent.click(within(menu).getByRole('button', { name: t.common.close }));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('shows the empty-list copy when the registry returns no lists', async () => {
    installFetch({ lists: () => json({ lists: [] }) });
    renderBtn();
    const menu = await openPopover();
    expect(await within(menu).findByText(t.lists.noLists)).toBeInTheDocument();
  });

  it('adds the VN to a list (optimistic) and refreshes', async () => {
    let itemsCall: { method: string; url: string; body: unknown } | null = null;
    installFetch({
      items: (method, url, body) => { itemsCall = { method, url, body }; return json({ ok: true }); },
    });
    renderBtn();
    const menu = await openPopover();
    const studio = await within(menu).findByRole('menuitemcheckbox', { name: /Studio X/ });
    expect(studio).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(studio);
    await waitFor(() => expect(studio).toHaveAttribute('aria-checked', 'true'));
    await waitFor(() => expect(itemsCall).not.toBeNull());
    expect(itemsCall!.method).toBe('POST');
    expect(itemsCall!.body).toEqual({ vn_id: 'v90001' });
    expect(await screen.findByText(t.lists.addedTo.replace('{name}', 'Studio X'))).toBeInTheDocument();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it('removes the VN from a list it already belongs to (DELETE path)', async () => {
    let itemsCall: { method: string; url: string } | null = null;
    installFetch({
      memberships: () => json({ lists: [list(1, 'Studio X')] }),
      items: (method, url) => { itemsCall = { method, url }; return json({ ok: true }); },
    });
    renderBtn();
    const menu = await openPopover();
    const studio = await within(menu).findByRole('menuitemcheckbox', { name: /Studio X/ });
    await waitFor(() => expect(studio).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(studio);
    await waitFor(() => expect(itemsCall).not.toBeNull());
    expect(itemsCall!.method).toBe('DELETE');
    expect(itemsCall!.url).toContain('vn=v90001');
    expect(await screen.findByText(t.lists.removedFrom.replace('{name}', 'Studio X'))).toBeInTheDocument();
  });

  it('rolls back the optimistic toggle and toasts when the request fails', async () => {
    installFetch({
      items: () => json({ error: 'toggle boom' }, 500),
    });
    renderBtn();
    const menu = await openPopover();
    const studio = await within(menu).findByRole('menuitemcheckbox', { name: /Studio X/ });
    fireEvent.click(studio);
    expect(await screen.findByText('toggle boom')).toBeInTheDocument();
    // Optimistic add rolled back to unchecked.
    await waitFor(() => expect(studio).toHaveAttribute('aria-checked', 'false'));
  });

  it('rolls back a failed removal to checked', async () => {
    installFetch({
      memberships: () => json({ lists: [list(1, 'Studio X')] }),
      items: () => json({ error: 'remove boom' }, 500),
    });
    renderBtn();
    const menu = await openPopover();
    const studio = await within(menu).findByRole('menuitemcheckbox', { name: /Studio X/ });
    await waitFor(() => expect(studio).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(studio);
    expect(await screen.findByText('remove boom')).toBeInTheDocument();
    await waitFor(() => expect(studio).toHaveAttribute('aria-checked', 'true'));
  });

  it('toasts when the registry load fails', async () => {
    installFetch({ lists: () => json({ error: 'load boom' }, 500) });
    renderBtn();
    await openPopover();
    expect(await screen.findByText('load boom')).toBeInTheDocument();
  });

  it('creates a new list from the input and immediately adds the VN', async () => {
    let createBody: unknown = null;
    let addedToCreated = false;
    installFetch({
      create: (body) => { createBody = body; return json({ list: list(42, 'Fresh List') }); },
      items: (method, url) => {
        if (url.includes('/api/lists/42/items') && method === 'POST') addedToCreated = true;
        return json({ ok: true });
      },
    });
    renderBtn();
    const menu = await openPopover();
    await within(menu).findByText('Studio X');
    const input = within(menu).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Fresh List' } });
    // A non-Enter keystroke must NOT submit (covers the false branch).
    fireEvent.keyDown(input, { key: 'a' });
    expect(createBody).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(createBody).toEqual({ name: 'Fresh List' }));
    await waitFor(() => expect(addedToCreated).toBe(true));
    expect(await within(menu).findByText('Fresh List')).toBeInTheDocument();
  });

  it('toasts when list creation fails', async () => {
    installFetch({ create: () => json({ error: 'create boom' }, 500) });
    renderBtn();
    const menu = await openPopover();
    await within(menu).findByText('Studio X');
    const input = within(menu).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Doomed' } });
    const createBtn = within(menu).getByRole('button', { name: t.lists.create });
    fireEvent.click(createBtn);
    expect(await screen.findByText('create boom')).toBeInTheDocument();
  });

  it('does not create a list for a blank name', async () => {
    let createCalls = 0;
    installFetch({ create: () => { createCalls++; return json({ list: list(99, 'Should not exist') }); } });
    renderBtn();
    const menu = await openPopover();
    await within(menu).findByText('Studio X');
    fireEvent.click(within(menu).getByRole('button', { name: t.lists.create }));
    expect(createCalls).toBe(0);
  });

  it('toasts when list creation returns an invalid body', async () => {
    installFetch({ create: () => json({ nope: true }) });
    renderBtn();
    const menu = await openPopover();
    await within(menu).findByText('Studio X');
    const input = within(menu).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Invalid Body' } });
    fireEvent.click(within(menu).getByRole('button', { name: t.lists.create }));
    expect(await screen.findByText(t.common.error)).toBeInTheDocument();
  });

  it('ignores duplicate create submissions while creation is pending', async () => {
    let resolveCreate: (response: Response) => void = () => {};
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (u === '/api/lists' && method === 'GET') return json({ lists: [list(1, 'Studio X')] });
      if (u === '/api/lists' && method === 'POST') {
        return new Promise<Response>((resolve) => { resolveCreate = resolve; });
      }
      if (u.startsWith('/api/vn/') && u.endsWith('/lists')) return json({ lists: [] });
      if (u.includes('/items')) return json({ ok: true });
      return json({});
    });
    renderBtn();
    const menu = await openPopover();
    await within(menu).findByText('Studio X');
    fireEvent.change(within(menu).getByRole('textbox'), { target: { value: 'Slow List' } });
    const createButton = within(menu).getByRole('button', { name: t.lists.create });
    act(() => {
      createButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      createButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(global.fetch).toHaveBeenCalledTimes(3);
    resolveCreate(json({ list: list(77, 'Slow List') }));
    expect(await within(menu).findByText('Slow List')).toBeInTheDocument();
  });

  it('suppresses stale create success and failure after the VN changes', async () => {
    let resolveCreate: (response: Response) => void = () => {};
    installFetch({
      create: () => new Response(
        new ReadableStream({
          start(controller) {
            resolveCreate = (response: Response) => {
              response.text().then((text) => {
                controller.enqueue(new TextEncoder().encode(text));
                controller.close();
              });
            };
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    });
    const { rerender } = renderBtn();
    const menu = await openPopover();
    await within(menu).findByText('Studio X');
    fireEvent.change(within(menu).getByRole('textbox'), { target: { value: 'Late List' } });
    fireEvent.click(within(menu).getByRole('button', { name: t.lists.create }));
    rerender(<ListsPickerButton vnId="v90002" />);
    resolveCreate(json({ list: list(88, 'Late List') }));
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('Late List')).toBeNull();

    let rejectCreate: (error: Error) => void = () => {};
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (u === '/api/lists' && method === 'GET') return json({ lists: [list(1, 'Studio X')] });
      if (u === '/api/lists' && method === 'POST') {
        return new Promise<Response>((_resolve, reject) => { rejectCreate = reject; });
      }
      if (u.startsWith('/api/vn/') && u.endsWith('/lists')) return json({ lists: [] });
      return json({});
    });
    rerender(<ListsPickerButton vnId="v90003" />);
    fireEvent.click(screen.getByRole('button', { name: t.lists.addToListAria }));
    const nextMenu = await screen.findByRole('menu');
    await within(nextMenu).findByText('Studio X');
    fireEvent.change(within(nextMenu).getByRole('textbox'), { target: { value: 'Failed Late List' } });
    fireEvent.click(within(nextMenu).getByRole('button', { name: t.lists.create }));
    rerender(<ListsPickerButton vnId="v90004" />);
    rejectCreate(new Error('stale create error'));
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('stale create error')).toBeNull();
  });

  it('shows a filter input past five lists and filters the visible rows', async () => {
    const big = Array.from({ length: 7 }, (_, i) => list(i + 1, `List ${i}`));
    installFetch({ lists: () => json({ lists: big }) });
    renderBtn();
    const menu = await openPopover();
    const filter = await within(menu).findByLabelText(t.lists.filterPlaceholder);
    fireEvent.change(filter, { target: { value: 'List 3' } });
    await waitFor(() => expect(within(menu).queryByText('List 0')).toBeNull());
    expect(within(menu).getByText('List 3')).toBeInTheDocument();
    // Non-matching filter falls into the "no lists" copy while lists exist.
    fireEvent.change(filter, { target: { value: 'zzz-no-match' } });
    expect(await within(menu).findByText(t.lists.noLists)).toBeInTheDocument();
  });

  it('moves focus through the menu with the arrow / Home / End keys', async () => {
    const big = Array.from({ length: 3 }, (_, i) => list(i + 1, `Row ${i}`));
    installFetch({ lists: () => json({ lists: big }) });
    renderBtn();
    const menu = await openPopover();
    const items = await within(menu).findAllByRole('menuitemcheckbox');
    items[0].focus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('leaves menu navigation inert when there are no list rows', async () => {
    installFetch({ lists: () => json({ lists: [] }) });
    renderBtn();
    const menu = await openPopover();
    await within(menu).findByText(t.lists.noLists);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).not.toBe(menu);
  });

  it('toasts when membership load fails', async () => {
    installFetch({ memberships: () => json({ error: 'membership boom' }, 500) });
    renderBtn();
    await openPopover();
    expect(await screen.findByText('membership boom')).toBeInTheDocument();
  });

  it('toasts the generic error when loaded list payloads are invalid', async () => {
    installFetch({ lists: () => json({ nope: true }), memberships: () => json({ lists: [] }) });
    renderBtn();
    await openPopover();
    expect(await screen.findByText(t.common.error)).toBeInTheDocument();
  });

  it('toasts the generic error for a non-Error load rejection', async () => {
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      const u = String(url);
      if (u === '/api/lists') return Promise.reject('plain failure');
      if (u.startsWith('/api/vn/') && u.endsWith('/lists')) return Promise.resolve(json({ lists: [] }));
      return Promise.resolve(json({}));
    });
    renderBtn();
    await openPopover();
    expect(await screen.findByText(t.common.error)).toBeInTheDocument();
  });

  it('ignores successful stale loads after the VN changes', async () => {
    const lists = deferredResponse();
    const memberships = deferredResponse();
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      const u = String(url);
      if (u === '/api/lists') return lists.promise;
      if (u.startsWith('/api/vn/') && u.endsWith('/lists')) return memberships.promise;
      return Promise.resolve(json({}));
    });
    const { rerender } = renderBtn();
    await openPopover();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    rerender(<ListsPickerButton vnId="v90002" />);
    await act(async () => {
      lists.resolve(json({ lists: [list(1, 'Late List')] }));
      memberships.resolve(json({ lists: [] }));
    });
    expect(screen.queryByText('Late List')).not.toBeInTheDocument();
  });

  it('ignores abort errors during load', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      const u = String(url);
      if (u === '/api/lists') return Promise.reject(abortError);
      if (u.startsWith('/api/vn/') && u.endsWith('/lists')) return Promise.resolve(json({ lists: [] }));
      return Promise.resolve(json({}));
    });
    renderBtn();
    await openPopover();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('aborted')).not.toBeInTheDocument();
  });

  it('ignores stale load failures after the VN changes', async () => {
    const lists = deferredResponse();
    const memberships = deferredResponse();
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      const u = String(url);
      if (u === '/api/lists') return lists.promise;
      if (u.startsWith('/api/vn/') && u.endsWith('/lists')) return memberships.promise;
      return Promise.resolve(json({}));
    });
    const { rerender } = renderBtn();
    await openPopover();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    rerender(<ListsPickerButton vnId="v90002" />);
    await act(async () => {
      lists.reject(new Error('stale load'));
      memberships.resolve(json({ lists: [] }));
    });
    expect(screen.queryByText('stale load')).not.toBeInTheDocument();
  });

  it('does not start a second toggle for the same list while one is pending', async () => {
    const pendingItem = deferredResponse();
    installFetch({ items: () => pendingItem.promise });
    renderBtn();
    const menu = await openPopover();
    const studio = await within(menu).findByRole('menuitemcheckbox', { name: /Studio X/ });
    act(() => {
      studio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      studio.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => String(c[0]).includes('/items'))).toHaveLength(1));
    await act(async () => {
      pendingItem.resolve(json({ ok: true }));
    });
  });

  it('ignores a successful stale toggle after the VN changes', async () => {
    const pendingItem = deferredResponse();
    installFetch({ items: () => pendingItem.promise });
    const { rerender } = renderBtn();
    const menu = await openPopover();
    const studio = await within(menu).findByRole('menuitemcheckbox', { name: /Studio X/ });
    fireEvent.click(studio);
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => String(c[0]).includes('/items'))).toHaveLength(1));
    rerender(<ListsPickerButton vnId="v90002" />);
    await act(async () => {
      pendingItem.resolve(json({ ok: true }));
    });
    expect(screen.queryByText(t.lists.addedTo.replace('{name}', 'Studio X'))).not.toBeInTheDocument();
  });

  it('ignores a failed stale toggle after the VN changes', async () => {
    const pendingItem = deferredResponse();
    installFetch({ items: () => pendingItem.promise });
    const { rerender } = renderBtn();
    const menu = await openPopover();
    const studio = await within(menu).findByRole('menuitemcheckbox', { name: /Studio X/ });
    fireEvent.click(studio);
    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) => String(c[0]).includes('/items'))).toHaveLength(1));
    rerender(<ListsPickerButton vnId="v90002" />);
    await act(async () => {
      pendingItem.reject(new Error('stale toggle'));
    });
    expect(screen.queryByText('stale toggle')).not.toBeInTheDocument();
  });
});
