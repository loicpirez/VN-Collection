// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, within, waitFor } from '@testing-library/react';
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

  it('surfaces an error when the other-branches read fails', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('/unassigned')) return json(UNASSIGNED);
      if (u.includes('/other-branches')) return json({ error: 'other read failed' }, 500);
      return json({ ok: true });
    });
    renderWithProviders(<AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />, { locale: 'en' });
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('other read failed');
  });

  it('surfaces the fallback error when branch response shapes are invalid', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('/unassigned')) return json({ branches: 'bad' });
      if (u.includes('/other-branches')) return json(OTHERS);
      return json({ ok: true });
    });
    renderWithProviders(<AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />, { locale: 'en' });
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Error');
  });

  it('ignores refresh results that resolve after unmount', async () => {
    const unassigned = deferred<Response>();
    const others = deferred<Response>();
    global.fetch = vi.fn((url: RequestInfo | URL) => String(url).includes('/unassigned') ? unassigned.promise : others.promise);
    const rendered = renderWithProviders(
      <AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    rendered.unmount();
    unassigned.resolve(json(UNASSIGNED));
    others.resolve(json(OTHERS));
    await Promise.all([unassigned.promise, others.promise]);
    await Promise.resolve();
  });

  it('ignores refresh AbortError after unmount', async () => {
    global.fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      const pending = deferred<Response>();
      init?.signal?.addEventListener('abort', () => pending.reject(new DOMException('aborted', 'AbortError')), { once: true });
      return pending.promise;
    });
    const rendered = renderWithProviders(
      <AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    rendered.unmount();
    await Promise.resolve();
  });

  it('ignores stale refresh errors after switching places', async () => {
    const firstUnassigned = deferred<Response>();
    let first = true;
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      const u = String(url);
      if (first && u.includes('/unassigned')) {
        first = false;
        return firstUnassigned.promise;
      }
      if (u.includes('/unassigned')) return Promise.resolve(json(UNASSIGNED));
      if (u.includes('/other-branches')) return Promise.resolve(json(OTHERS));
      return Promise.resolve(json({ ok: true }));
    });
    const rendered = renderWithProviders(
      <AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    rendered.rerender(<AssignProviderDialog place={makePlace({ id: 8, name: 'Shop Eight' })} onClose={vi.fn()} onSaved={vi.fn()} />);
    firstUnassigned.reject(new Error('late stale read'));
    await Promise.resolve();
    expect(screen.queryByText('late stale read')).toBeNull();
  });

  it('uses the fallback error text for non-Error refresh failures', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('/unassigned')) throw 'plain read failure';
      if (u.includes('/other-branches')) return json(OTHERS);
      return json({ ok: true });
    });
    renderWithProviders(<AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />, { locale: 'en' });
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Error');
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

  it('keeps linked state stable when linking an already-linked unassigned branch', async () => {
    const { user } = renderWithProviders(
      <AssignProviderDialog
        place={makePlace({ provider_labels: ['Free Branch B'] })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
      { locale: 'en' },
    );
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByText('Free Branch B');
    await user.click(within(dialog).getAllByRole('button', { name: t.places.assignBranch as string })[0]!);
    await waitFor(() => expect(within(dialog).getAllByText('Free Branch B')).toHaveLength(1));
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

  it('drops stale link, unlink, and move success results after place changes', async () => {
    const pendingLink = deferred<Response>();
    let mutationIndex = 0;
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/unassigned')) return Promise.resolve(json(UNASSIGNED));
      if (u.includes('/other-branches')) return Promise.resolve(json(OTHERS));
      if (u.includes('/link') && init?.method === 'POST') {
        mutationIndex += 1;
        return mutationIndex === 1 ? pendingLink.promise : Promise.resolve(json({ ok: true }));
      }
      return Promise.resolve(json({ ok: true }));
    });
    const onSaved = vi.fn();
    const rendered = renderWithProviders(
      <AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={onSaved} />,
      { locale: 'en' },
    );
    const dialog = screen.getByRole('dialog');
    const linkRow = (await within(dialog).findByText('Free Branch B')).closest('li')!;
    fireEvent.click(within(linkRow).getByRole('button', { name: t.places.assignBranch as string }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    rendered.rerender(<AssignProviderDialog place={makePlace({ id: 8, name: 'Shop Eight' })} onClose={vi.fn()} onSaved={onSaved} />);
    pendingLink.resolve(json({ ok: true }));
    await pendingLink.promise;
    await Promise.resolve();
    expect(onSaved).not.toHaveBeenCalled();

    const pendingUnlink = deferred<Response>();
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/unassigned')) return Promise.resolve(json(UNASSIGNED));
      if (u.includes('/other-branches')) return Promise.resolve(json(OTHERS));
      if (u.includes('/link') && init?.method === 'DELETE') return pendingUnlink.promise;
      return Promise.resolve(json({ ok: true }));
    });
    cleanup();
    const unlinkRender = renderWithProviders(
      <AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={onSaved} />,
      { locale: 'en' },
    );
    const unlinkDialog = screen.getByRole('dialog');
    await within(unlinkDialog).findByText('Free Branch B');
    fireEvent.click(within(within(unlinkDialog).getByText('Linked Branch A').closest('li')!).getByRole('button', { name: t.places.unassignBranch as string }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    unlinkRender.rerender(<AssignProviderDialog place={makePlace({ id: 8, name: 'Shop Eight' })} onClose={vi.fn()} onSaved={onSaved} />);
    pendingUnlink.resolve(json({ ok: true }));
    await pendingUnlink.promise;
    await Promise.resolve();
    expect(onSaved).not.toHaveBeenCalled();

    const pendingMove = deferred<Response>();
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/unassigned')) return Promise.resolve(json(UNASSIGNED));
      if (u.includes('/other-branches')) return Promise.resolve(json(OTHERS));
      if (u.includes('/link') && init?.method === 'POST') return pendingMove.promise;
      return Promise.resolve(json({ ok: true }));
    });
    cleanup();
    const moveRender = renderWithProviders(
      <AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={onSaved} />,
      { locale: 'en' },
    );
    const moveDialog = screen.getByRole('dialog');
    const otherRow = (await within(moveDialog).findByText('Other Branch D')).closest('li')!;
    fireEvent.click(within(otherRow).getByRole('button', { name: t.places.moveHere as string }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    moveRender.rerender(<AssignProviderDialog place={makePlace({ id: 8, name: 'Shop Eight' })} onClose={vi.fn()} onSaved={onSaved} />);
    pendingMove.resolve(json({ ok: true }));
    await pendingMove.promise;
    await Promise.resolve();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('uses fallback text for non-Error link, unlink, and move failures', async () => {
    for (const action of ['link', 'unlink', 'move'] as const) {
      cleanup();
      global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('/unassigned')) return Promise.resolve(json(UNASSIGNED));
        if (u.includes('/other-branches')) return Promise.resolve(json(OTHERS));
        if (u.includes('/link') && init?.method) throw 'plain mutation failure';
        return Promise.resolve(json({ ok: true }));
      });
      const { user } = renderWithProviders(
        <AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />,
        { locale: 'en' },
      );
      const dialog = screen.getByRole('dialog');
      await within(dialog).findByText('Free Branch B');
      if (action === 'link') {
        const row = within(dialog).getByText('Free Branch B').closest('li')!;
        await user.click(within(row).getByRole('button', { name: t.places.assignBranch as string }));
      } else if (action === 'unlink') {
        const row = within(dialog).getByText('Linked Branch A').closest('li')!;
        await user.click(within(row).getByRole('button', { name: t.places.unassignBranch as string }));
      } else {
        const row = within(dialog).getByText('Other Branch D').closest('li')!;
        await user.click(within(row).getByRole('button', { name: t.places.moveHere as string }));
        await user.click(await screen.findByRole('button', { name: 'Confirm' }));
      }
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Error');
    }
  });

  it('drops stale link, unlink, and move failure results after place changes', async () => {
    for (const action of ['link', 'unlink', 'move'] as const) {
      cleanup();
      const pending = deferred<Response>();
      global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('/unassigned')) return Promise.resolve(json(UNASSIGNED));
        if (u.includes('/other-branches')) return Promise.resolve(json(OTHERS));
        if (u.includes('/link') && init?.method) return pending.promise;
        return Promise.resolve(json({ ok: true }));
      });
      const rendered = renderWithProviders(
        <AssignProviderDialog place={makePlace()} onClose={vi.fn()} onSaved={vi.fn()} />,
        { locale: 'en' },
      );
      const dialog = screen.getByRole('dialog');
      await within(dialog).findByText('Free Branch B');
      if (action === 'link') {
        fireEvent.click(within(within(dialog).getByText('Free Branch B').closest('li')!).getByRole('button', { name: t.places.assignBranch as string }));
      } else if (action === 'unlink') {
        fireEvent.click(within(within(dialog).getByText('Linked Branch A').closest('li')!).getByRole('button', { name: t.places.unassignBranch as string }));
      } else {
        fireEvent.click(within(within(dialog).getByText('Other Branch D').closest('li')!).getByRole('button', { name: t.places.moveHere as string }));
        fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
      }
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
      rendered.rerender(<AssignProviderDialog place={makePlace({ id: 8, name: 'Shop Eight' })} onClose={vi.fn()} onSaved={vi.fn()} />);
      pending.resolve(json({ error: 'late stale mutation' }, 500));
      await pending.promise;
      await Promise.resolve();
      expect(screen.queryByText('late stale mutation')).toBeNull();
    }
  });

  it('keeps linked state stable when moving an already-linked other branch', async () => {
    const { user } = renderWithProviders(
      <AssignProviderDialog
        place={makePlace({ provider_labels: ['Other Branch D'] })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
      { locale: 'en' },
    );
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByText('Other Branch D');
    await user.click(within(dialog).getByRole('button', { name: t.places.moveHere as string }));
    await user.click(await screen.findByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(within(dialog).getAllByText('Other Branch D')).toHaveLength(1));
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
