// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
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

function list(id: number, name: string, color: string | null = null) {
  return { id, name, color, pinned: 0 };
}

interface Handlers {
  lists?: () => Response;
  memberships?: () => Response;
  create?: (body: unknown) => Response;
  items?: (method: string, url: string, body: unknown) => Response;
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
});
