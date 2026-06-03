// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { VndbStatusPanel } from '@/components/VndbStatusPanel';
import { EGS_CHANGED_EVENT } from '@/components/EgsPanel';
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

const LABELS = [
  { id: 1, label: 'Playing', private: false },
  { id: 2, label: 'Finished', private: false },
  { id: 5, label: 'Wishlist', private: false },
  { id: 7, label: 'Voted', private: false },
  { id: 11, label: 'My Secret', private: true },
];

/**
 * Build a /api/vn/[id]/vndb-status state with an optional ulist entry.
 * Entry id must be a real VNDB id and labels need the {id,label} shape.
 */
function statePayload(opts: { entry?: boolean; vote?: number | null; labelIds?: number[]; needsAuth?: boolean } = {}) {
  const entry = opts.entry
    ? {
        id: 'v90001',
        added: 100,
        voted: null,
        lastmod: 200,
        vote: opts.vote ?? null,
        started: '2024-01-01',
        finished: null,
        notes: 'hello',
        labels: (opts.labelIds ?? [1]).map((id) => ({ id, label: LABELS.find((l) => l.id === id)?.label ?? `L${id}` })),
      }
    : null;
  return { entry, labels: LABELS, needsAuth: opts.needsAuth ?? false };
}

function render(vnId = 'v90001') {
  return renderWithProviders(<VndbStatusPanel vnId={vnId} />, { locale: 'en' });
}

describe('VndbStatusPanel branches', () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the skeleton while the initial load is in flight', () => {
    let resolve!: (r: Response) => void;
    global.fetch = vi.fn(() => new Promise<Response>((r) => { resolve = r; }));
    const { container } = render();
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
    resolve(json(statePayload()));
  });

  it('renders the localized error alert and retries on the retry button', async () => {
    let call = 0;
    global.fetch = vi.fn(async () => {
      call += 1;
      // The panel reads the machine-readable `code`, not the raw `error`.
      if (call === 1) return json({ code: 'vndb_unavailable', error: 'x' }, 503);
      return json(statePayload({ entry: false }));
    });
    render();
    expect(await screen.findByText(t.apiErrors.vndbUnavailable)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.common.retry }));
    await waitFor(() => expect(screen.queryByText(t.apiErrors.vndbUnavailable)).toBeNull());
    // After a clean reload with no entry, the togglable labels appear.
    expect(await screen.findByRole('button', { name: 'Playing' })).toBeInTheDocument();
  });

  it('renders the needs-token notice when the server reports needsAuth', async () => {
    global.fetch = vi.fn(async () => json(statePayload({ needsAuth: true })));
    render();
    expect(await screen.findByText(t.vndbStatus.needsToken)).toBeInTheDocument();
  });

  it('hides the wishlist label (id 7) from the togglable set and shows the private badge', async () => {
    global.fetch = vi.fn(async () => json(statePayload({ entry: true, labelIds: [1] })));
    render();
    expect(await screen.findByRole('button', { name: 'Playing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finished' })).toBeInTheDocument();
    // Voted (id 7) must NOT be a toggle button.
    expect(screen.queryByRole('button', { name: 'Voted' })).toBeNull();
    // The custom private label shows the private badge.
    expect(screen.getByText(t.vndbStatus.privateBadge)).toBeInTheDocument();
  });

  it('shows the current VNDB vote on file when the entry carries a vote', async () => {
    global.fetch = vi.fn(async () => json(statePayload({ entry: true, vote: 85, labelIds: [1] })));
    render();
    // 85 / 10 -> 8.5/10
    expect(await screen.findByText('8.5/10')).toBeInTheDocument();
  });

  it('sets a label that is not yet active (labels_set path)', async () => {
    let lastBody: unknown = null;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        lastBody = JSON.parse(String(init.body));
        return json({ ok: true });
      }
      return json(statePayload({ entry: true, labelIds: [1] }));
    });
    render();
    const finished = await screen.findByRole('button', { name: 'Finished' });
    fireEvent.click(finished);
    await waitFor(() => expect(lastBody).toEqual({ labels_set: [2] }));
    await waitFor(() => expect(screen.getByText(t.toast.saved)).toBeInTheDocument());
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it('unsets a label that is already active (labels_unset path)', async () => {
    let lastBody: unknown = null;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        lastBody = JSON.parse(String(init.body));
        return json({ ok: true });
      }
      return json(statePayload({ entry: true, labelIds: [1] }));
    });
    render();
    const playing = await screen.findByRole('button', { name: 'Playing' });
    expect(playing).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(playing);
    await waitFor(() => expect(lastBody).toEqual({ labels_unset: [1] }));
  });

  it('surfaces a localized toast error when a label toggle fails', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') return json({ code: 'vndb_token_required' }, 401);
      return json(statePayload({ entry: true, labelIds: [1] }));
    });
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Finished' }));
    expect(await screen.findByText(t.apiErrors.vndbTokenRequired)).toBeInTheDocument();
  });

  it('clears all labels after the danger confirmation and refreshes', async () => {
    let deleteCalled = false;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        deleteCalled = true;
        return json({ ok: true });
      }
      return json(statePayload({ entry: true, labelIds: [1] }));
    });
    render();
    const clearBtn = await screen.findByRole('button', { name: t.vndbStatus.removeFromList });
    fireEvent.click(clearBtn);
    const confirmDialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(deleteCalled).toBe(true));
    await waitFor(() => expect(screen.getByText(t.toast.removed)).toBeInTheDocument());
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it('aborts clear-all when the user cancels the confirmation', async () => {
    let deleteCalled = false;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') { deleteCalled = true; return json({ ok: true }); }
      return json(statePayload({ entry: true, labelIds: [1] }));
    });
    render();
    fireEvent.click(await screen.findByRole('button', { name: t.vndbStatus.removeFromList }));
    const confirmDialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: t.common.cancel }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deleteCalled).toBe(false);
  });

  it('surfaces a localized toast error when clear-all fails after confirmation', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') return json({ code: 'vndb_unavailable' }, 503);
      return json(statePayload({ entry: true, labelIds: [1] }));
    });
    render();
    fireEvent.click(await screen.findByRole('button', { name: t.vndbStatus.removeFromList }));
    const confirmDialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: t.common.confirm }));
    expect(await screen.findByText(t.apiErrors.vndbUnavailable)).toBeInTheDocument();
  });

  it('treats an aborted initial load as a no-op (no error surfaced)', async () => {
    // A rejection whose name is AbortError takes the early-return branch
    // in load()'s catch, so neither the error alert nor a toast appears.
    global.fetch = vi.fn(async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    const { container } = render();
    // The skeleton clears (finally runs) but no error band renders.
    await waitFor(() => expect(container.querySelector('.animate-pulse')).toBeNull());
    expect(screen.queryByText(t.common.error)).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('manual Refresh button re-fetches the panel endpoint', async () => {
    const urls: string[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return json(statePayload({ entry: false }));
    });
    render();
    await screen.findByRole('button', { name: 'Playing' });
    const before = urls.length;
    fireEvent.click(screen.getByRole('button', { name: t.vndbStatus.refresh }));
    await waitFor(() => expect(urls.length).toBeGreaterThan(before));
    expect(urls.every((u) => u.includes('/api/vn/v90001/vndb-status'))).toBe(true);
  });

  it('reloads when an EGS-changed event fires for the same VN', async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls += 1;
      return json(statePayload({ entry: false }));
    });
    render();
    await screen.findByRole('button', { name: 'Playing' });
    const before = calls;
    window.dispatchEvent(new CustomEvent(EGS_CHANGED_EVENT, { detail: { vnId: 'v90001' } }));
    await waitFor(() => expect(calls).toBeGreaterThan(before));
  });

  it('ignores an EGS-changed event scoped to a different VN', async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls += 1;
      return json(statePayload({ entry: false }));
    });
    render();
    await screen.findByRole('button', { name: 'Playing' });
    const before = calls;
    window.dispatchEvent(new CustomEvent(EGS_CHANGED_EVENT, { detail: { vnId: 'v99999' } }));
    // Give any errant reload a chance to fire, then assert none did.
    await Promise.resolve();
    expect(calls).toBe(before);
  });

  describe('UlistDetailsEditor', () => {
    it('saves a valid vote, dates, and notes through the editor', async () => {
      let patchBody: Record<string, unknown> | null = null;
      global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          patchBody = JSON.parse(String(init.body));
          return json({ ok: true });
        }
        return json(statePayload({ entry: true, vote: 70, labelIds: [1] }));
      });
      const { container } = render();
      const summary = await screen.findByText(t.vndbStatus.detailsToggle);
      fireEvent.click(summary);
      const voteInput = await screen.findByPlaceholderText('-');
      fireEvent.change(voteInput, { target: { value: '9.0' } });
      // Edit the notes textarea to exercise the markDirty(setNotes) path.
      const notes = container.querySelector('textarea') as HTMLTextAreaElement;
      fireEvent.change(notes, { target: { value: 'updated notes' } });
      fireEvent.click(screen.getByRole('button', { name: t.vndbStatus.detailsSave }));
      await waitFor(() => expect(patchBody).not.toBeNull());
      // 9.0 * 10 -> 90 on the wire; notes trimmed through.
      expect(patchBody!.vote).toBe(90);
      expect(patchBody!.notes).toBe('updated notes');
      await waitFor(() => expect(screen.getByText(t.toast.saved)).toBeInTheDocument());
    });

    it('clears the vote to null when the field is emptied', async () => {
      let patchBody: Record<string, unknown> | null = null;
      global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          patchBody = JSON.parse(String(init.body));
          return json({ ok: true });
        }
        return json(statePayload({ entry: true, vote: 70, labelIds: [1] }));
      });
      render();
      fireEvent.click(await screen.findByText(t.vndbStatus.detailsToggle));
      const voteInput = await screen.findByPlaceholderText('-');
      fireEvent.change(voteInput, { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: t.vndbStatus.detailsSave }));
      await waitFor(() => expect(patchBody).not.toBeNull());
      expect(patchBody!.vote).toBeNull();
    });

    it('rejects an out-of-range vote without calling the API', async () => {
      let patchCalled = false;
      global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PATCH') { patchCalled = true; return json({ ok: true }); }
        return json(statePayload({ entry: true, vote: 70, labelIds: [1] }));
      });
      render();
      fireEvent.click(await screen.findByText(t.vndbStatus.detailsToggle));
      const voteInput = await screen.findByPlaceholderText('-');
      fireEvent.change(voteInput, { target: { value: '99' } });
      fireEvent.click(screen.getByRole('button', { name: t.vndbStatus.detailsSave }));
      expect(await screen.findByText(t.vndbStatus.voteRange)).toBeInTheDocument();
      expect(patchCalled).toBe(false);
    });

    it('shows a localized toast error when the editor save request fails', async () => {
      global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PATCH') return json({ code: 'vndb_unavailable' }, 503);
        return json(statePayload({ entry: true, vote: 70, labelIds: [1] }));
      });
      render();
      fireEvent.click(await screen.findByText(t.vndbStatus.detailsToggle));
      const voteInput = await screen.findByPlaceholderText('-');
      fireEvent.change(voteInput, { target: { value: '8.0' } });
      fireEvent.click(screen.getByRole('button', { name: t.vndbStatus.detailsSave }));
      expect(await screen.findByText(t.apiErrors.vndbUnavailable)).toBeInTheDocument();
    });
  });
});
