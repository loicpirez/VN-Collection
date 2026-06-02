// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, within, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { AssignProviderDialog } from '@/components/AssignProviderDialog';
import type { PlaceWithLinks } from '@/lib/db';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function makePlace(overrides: Partial<PlaceWithLinks> = {}): PlaceWithLinks {
  return {
    id: 7,
    name: 'Shop Seven',
    name_ja: null,
    kind: 'shop',
    address: null,
    lat: null,
    lng: null,
    url: null,
    notes: null,
    created_at: 1700000000,
    updated_at: 1700000000,
    provider_labels: ['Linked Branch A'],
    stock_count: 0,
    ...overrides,
  };
}

const UNASSIGNED = { branches: ['Free Branch B', 'Free Branch C'] };
const OTHERS = { branches: [{ provider_label: 'Other Branch D', place_id: 9, place_name: 'Shop Nine' }] };

/** Route the unassigned + other-branches reads and the link/unlink writes. */
function routeFetch(opts: { unassigned?: unknown; others?: unknown; mutation?: () => Response } = {}) {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/unassigned')) return json(opts.unassigned ?? UNASSIGNED);
    if (u.includes('/other-branches')) return json(opts.others ?? OTHERS);
    if (u.includes('/link')) return opts.mutation ? opts.mutation() : json({ ok: true });
    return json({ ok: true });
  });
}

describe('AssignProviderDialog', () => {
  beforeEach(() => {
    global.fetch = routeFetch();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows loading skeletons before the branch lists resolve', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    renderWithProviders(<AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />, { locale: 'en' });
    const dialog = screen.getByRole('dialog');
    // Linked section renders synchronously from props; the unassigned list shows a skeleton.
    expect(within(dialog).getByRole('status')).toBeInTheDocument();
  });

  it('renders linked, unassigned, and other-place branches after the fetches resolve', async () => {
    renderWithProviders(<AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />, { locale: 'en' });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Linked Branch A')).toBeInTheDocument();
    expect(await within(dialog).findByText('Free Branch B')).toBeInTheDocument();
    expect(within(dialog).getByText('Free Branch C')).toBeInTheDocument();
    expect(within(dialog).getByText('Other Branch D')).toBeInTheDocument();
  });

  it('links an unassigned branch and moves it into the linked section', async () => {
    const calls: { url: string; method?: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/unassigned')) return json(UNASSIGNED);
      if (u.includes('/other-branches')) return json(OTHERS);
      calls.push({ url: u, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : null });
      return json({ ok: true });
    });
    const onSaved = vi.fn();
    const { user } = renderWithProviders(
      <AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={onSaved} />, { locale: 'en' },
    );
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByText('Free Branch B');

    const row = within(dialog).getByText('Free Branch B').closest('li')!;
    await user.click(within(row).getByRole('button', { name: 'Assign' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe('/api/places/7/link');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toEqual({ provider_label: 'Free Branch B' });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    // It now appears in the Linked section list.
    await waitFor(() =>
      expect(within(dialog).getAllByText('Free Branch B').length).toBe(1),
    );
  });

  it('unlinks a linked branch back to the unassigned section', async () => {
    const calls: { method?: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/unassigned')) return json(UNASSIGNED);
      if (u.includes('/other-branches')) return json(OTHERS);
      calls.push({ method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : null });
      return json({ ok: true });
    });
    const { user } = renderWithProviders(
      <AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />, { locale: 'en' },
    );
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByText('Free Branch B');
    const linkedRow = within(dialog).getByText('Linked Branch A').closest('li')!;
    await user.click(within(linkedRow).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].body).toEqual({ provider_label: 'Linked Branch A' });
  });

  it('confirms then moves a branch from another place', async () => {
    const calls: { url: string; method?: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/unassigned')) return json(UNASSIGNED);
      if (u.includes('/other-branches')) return json(OTHERS);
      calls.push({ url: u, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : null });
      return json({ ok: true });
    });
    const { user } = renderWithProviders(
      <AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />, { locale: 'en' },
    );
    const dialog = screen.getByRole('dialog');
    const otherRow = (await within(dialog).findByText('Other Branch D')).closest('li')!;
    await user.click(within(otherRow).getByRole('button', { name: 'Move here' }));

    // Confirmation dialog from ConfirmProvider.
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe('/api/places/7/link');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toEqual({ provider_label: 'Other Branch D', from_place_id: 9 });
  });

  it('does not move when the confirmation is cancelled', async () => {
    const calls: unknown[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/unassigned')) return json(UNASSIGNED);
      if (u.includes('/other-branches')) return json(OTHERS);
      calls.push(u);
      return json({ ok: true });
    });
    const { user } = renderWithProviders(
      <AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />, { locale: 'en' },
    );
    const dialog = screen.getByRole('dialog');
    const otherRow = (await within(dialog).findByText('Other Branch D')).closest('li')!;
    await user.click(within(otherRow).getByRole('button', { name: 'Move here' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    // No link request fired.
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls).toHaveLength(0);
  });

  it('filters all three sections by the search field', async () => {
    const { user } = renderWithProviders(
      <AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />, { locale: 'en' },
    );
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByText('Free Branch B');

    await user.type(within(dialog).getByLabelText('Search a branch or shop...'), 'Branch C');
    await waitFor(() => expect(within(dialog).queryByText('Free Branch B')).toBeNull());
    expect(within(dialog).getByText('Free Branch C')).toBeInTheDocument();
    expect(within(dialog).queryByText('Linked Branch A')).toBeNull();
  });

  it('surfaces an inline error when a branch read fails', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('/unassigned')) return json({ error: 'read failed' }, 500);
      if (u.includes('/other-branches')) return json(OTHERS);
      return json({ ok: true });
    });
    renderWithProviders(<AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />, { locale: 'en' });
    const dialog = screen.getByRole('dialog');
    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain('read failed');
  });

  it('closes via the header close button', async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <AssignProviderDialog place={makePlace()} onClose={onClose} onSaved={vi.fn()} />, { locale: 'en' },
    );
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
