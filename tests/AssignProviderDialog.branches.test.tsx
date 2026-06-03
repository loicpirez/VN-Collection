// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, within, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { AssignProviderDialog } from '@/components/AssignProviderDialog';
import type { PlaceWithLinks } from '@/lib/db';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;

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

/** Reads succeed; the link/unlink/move write returns a configurable response. */
function routeFetch(mutation: () => Response) {
  return vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes('/unassigned')) return json(UNASSIGNED);
    if (u.includes('/other-branches')) return json(OTHERS);
    if (u.includes('/link')) return mutation();
    return json({ ok: true });
  });
}

describe('AssignProviderDialog branches', () => {
  beforeEach(() => {
    global.fetch = routeFetch(() => json({ ok: true }));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('surfaces an error when linking a branch fails', async () => {
    global.fetch = routeFetch(() => json({ error: 'link broke' }, 500));
    const { user } = renderWithProviders(
      <AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />, { locale: 'en' },
    );
    const dialog = screen.getByRole('dialog');
    const row = (await within(dialog).findByText('Free Branch B')).closest('li')!;
    await user.click(within(row).getByRole('button', { name: t.places.assignBranch as string }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('link broke');
  });

  it('surfaces an error when unlinking a branch fails', async () => {
    global.fetch = routeFetch(() => json({ error: 'unlink broke' }, 500));
    const { user } = renderWithProviders(
      <AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />, { locale: 'en' },
    );
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByText('Free Branch B');
    const linkedRow = within(dialog).getByText('Linked Branch A').closest('li')!;
    await user.click(within(linkedRow).getByRole('button', { name: t.places.unassignBranch as string }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('unlink broke');
  });

  it('re-adds an unlinked branch into the unassigned list in sorted order', async () => {
    const { user } = renderWithProviders(
      <AssignProviderDialog
        place={makePlace({ provider_labels: ['Branch M'] })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
      { locale: 'en' },
    );
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByText('Free Branch B');
    const linkedRow = within(dialog).getByText('Branch M').closest('li')!;
    await user.click(within(linkedRow).getByRole('button', { name: t.places.unassignBranch as string }));
    // It now appears among the unassigned branches.
    await waitFor(() => expect(within(dialog).getAllByText('Branch M').length).toBe(1));
  });

  it('surfaces an error when moving from another place fails', async () => {
    global.fetch = routeFetch(() => json({ error: 'move broke' }, 500));
    const { user } = renderWithProviders(
      <AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />, { locale: 'en' },
    );
    const dialog = screen.getByRole('dialog');
    const otherRow = (await within(dialog).findByText('Other Branch D')).closest('li')!;
    await user.click(within(otherRow).getByRole('button', { name: t.places.moveHere as string }));
    await user.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('move broke');
  });

  it('shows a no-match message in the unassigned section when the search excludes every branch', async () => {
    const { user } = renderWithProviders(
      <AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />, { locale: 'en' },
    );
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByText('Free Branch B');
    await user.type(within(dialog).getByLabelText(t.places.assignSearchPlaceholder as string), 'zzz-nothing');
    // Both the unassigned and other-places sections fall back to the
    // no-match copy when the query matches nothing.
    await waitFor(() => expect(within(dialog).queryByText('Free Branch B')).toBeNull());
    expect(within(dialog).getAllByText(t.places.searchNoMatch as string)).toHaveLength(2);
  });

  it('shows a no-match message in the other-places section when the search excludes its branches', async () => {
    const { user } = renderWithProviders(
      <AssignProviderDialog
        place={makePlace({ provider_labels: [] })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
      { locale: 'en' },
    );
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByText('Other Branch D');
    // Match an unassigned branch (so that section is non-empty) while
    // excluding the other-places branch, exercising its no-match path.
    await user.type(within(dialog).getByLabelText(t.places.assignSearchPlaceholder as string), 'Free Branch B');
    await waitFor(() => expect(within(dialog).queryByText('Other Branch D')).toBeNull());
    expect(within(dialog).getByText(t.places.searchNoMatch as string)).toBeInTheDocument();
  });

  it('closes when the backdrop is clicked', async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <AssignProviderDialog place={makePlace()} onClose={onClose} onSaved={vi.fn()} />, { locale: 'en' },
    );
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.parentElement!.querySelector('[aria-hidden]') as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
