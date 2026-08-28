// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { VndbReleaseListPanel } from '@/components/VndbReleaseListPanel';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const t = dictionaries.en;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderPanel(releaseId = 'r90001', vnId = 'v90001', locallyOwned = false) {
  return renderWithProviders(
    <VndbReleaseListPanel releaseId={releaseId} vnId={vnId} locallyOwned={locallyOwned} />,
    { locale: 'en' },
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('VndbReleaseListPanel', () => {
  it('shows a matching skeleton while the initial request is pending', async () => {
    const pending = deferredResponse();
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));
    const view = renderPanel();
    expect(view.container.querySelector('[data-vndb-release-list-skeleton]')).toBeInTheDocument();
    await act(async () => pending.resolve(json({ needsAuth: true, status: null })));
    expect(await screen.findByText(t.vndbStatus.needsToken)).toBeInTheDocument();
  });

  it('shows the token requirement without exposing mutation controls', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ needsAuth: true, status: null })));
    renderPanel();
    expect(await screen.findByText(t.vndbStatus.needsToken)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.releases.vndbListSave })).not.toBeInTheDocument();
  });

  it('keeps local ownership separate and only preselects Obtained', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ needsAuth: false, status: null })));
    renderPanel('r90001', 'v90001', true);
    expect(await screen.findByText(t.releases.vndbListNotListed)).toBeInTheDocument();
    expect(screen.getByText(t.releases.vndbListLocalOwnedHint)).toBeInTheDocument();
    expect(screen.getByLabelText(t.releases.vndbListStatusLabel)).toHaveValue('2');
    expect(screen.getByLabelText(t.releases.vndbListStatusLabel)).toHaveClass('input', 'h-11');
    expect(screen.getByRole('button', { name: t.releases.vndbListSave })).toBeEnabled();
  });

  it('saves an explicit state and disables saving once synchronized', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (init?.method === 'PATCH') return json({ ok: true, status: 3 });
      return json({ needsAuth: false, status: 1 });
    }));
    renderPanel();
    const select = await screen.findByLabelText(t.releases.vndbListStatusLabel);
    expect(select).toHaveValue('1');
    expect(screen.getByRole('button', { name: t.releases.vndbListSave })).toBeDisabled();
    fireEvent.change(select, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: t.releases.vndbListSave }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toMatchObject({ url: '/api/release/r90001/vndb-list', init: { method: 'PATCH' } });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ status: 3 });
    expect(await screen.findByText(t.releases.vndbListSaved)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.releases.vndbListSave })).toBeDisabled();
  });

  it('coalesces duplicate save events while one mutation is in flight', async () => {
    const pending = deferredResponse();
    let patchCalls = 0;
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        patchCalls += 1;
        return pending.promise;
      }
      return Promise.resolve(json({ needsAuth: false, status: 1 }));
    }));
    renderPanel();
    const select = await screen.findByLabelText(t.releases.vndbListStatusLabel);
    fireEvent.change(select, { target: { value: '2' } });
    const saveButton = screen.getByRole('button', { name: t.releases.vndbListSave });
    act(() => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(patchCalls).toBe(1);
    await act(async () => pending.resolve(json({ ok: true, status: 2 })));
    expect(await screen.findByText(t.releases.vndbListSaved)).toBeInTheDocument();
  });

  it.each([
    { ok: true, status: 9 },
    { ok: true, status: null },
  ])('rejects malformed save payload %#', async (payload) => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => (
      init?.method === 'PATCH' ? json(payload) : json({ needsAuth: false, status: 1 })
    )));
    renderPanel();
    const select = await screen.findByLabelText(t.releases.vndbListStatusLabel);
    fireEvent.change(select, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: t.releases.vndbListSave }));
    await waitFor(() => expect(screen.getAllByText(t.common.error).length).toBeGreaterThan(0));
  });

  it('uses the localized fallback for a non-Error save rejection', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') throw 'network failure';
      return json({ needsAuth: false, status: 1 });
    }));
    renderPanel();
    const select = await screen.findByLabelText(t.releases.vndbListStatusLabel);
    fireEvent.change(select, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: t.releases.vndbListSave }));
    await waitFor(() => expect(screen.getAllByText(t.common.error).length).toBeGreaterThan(0));
  });

  it('silently settles an aborted save', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') throw new DOMException('Aborted', 'AbortError');
      return json({ needsAuth: false, status: 1 });
    }));
    renderPanel();
    const select = await screen.findByLabelText(t.releases.vndbListStatusLabel);
    fireEvent.change(select, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: t.releases.vndbListSave }));
    await waitFor(() => expect(screen.getByRole('button', { name: t.releases.vndbListSave })).toBeEnabled());
    expect(screen.queryByText(t.releases.vndbListSaved)).not.toBeInTheDocument();
  });

  it('ignores a synthetic select value outside the supported states', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ needsAuth: false, status: 1 })));
    renderPanel();
    const select = await screen.findByLabelText(t.releases.vndbListStatusLabel);
    fireEvent.change(select, { target: { value: '9' } });
    expect(select).toHaveValue('1');
  });

  it('cancels and then confirms removal without touching the local inventory', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => (
      init?.method === 'DELETE'
        ? json({ ok: true, status: null })
        : json({ needsAuth: false, status: 2 })
    ));
    vi.stubGlobal('fetch', fetchMock);
    renderPanel('r90001', 'v90001', true);
    const removeButton = await screen.findByRole('button', { name: t.releases.vndbListRemove });
    fireEvent.click(removeButton);
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.common.cancel }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(removeButton);
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'DELETE' });
    expect(await screen.findByText(t.releases.vndbListRemoved)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.releases.vndbListRemove })).not.toBeInTheDocument();
    expect(screen.getByLabelText(t.releases.vndbListStatusLabel)).toHaveValue('2');
  });

  it('renders removal progress and resets an absent non-owned edition to Unknown', async () => {
    const pending = deferredResponse();
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      init?.method === 'DELETE'
        ? pending.promise
        : Promise.resolve(json({ needsAuth: false, status: 2 }))
    )));
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: t.releases.vndbListRemove }));
    const dialog = await screen.findByRole('alertdialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: t.common.confirm }));
      await Promise.resolve();
    });
    await waitFor(() => {
      const removeButton = screen.getByRole('button', { name: t.releases.vndbListRemove });
      expect(removeButton.querySelector('.animate-spin')).toBeInTheDocument();
    });
    await act(async () => pending.resolve(json({ ok: true, status: null })));
    await waitFor(() => expect(screen.getByLabelText(t.releases.vndbListStatusLabel)).toHaveValue('0'));
  });

  it.each([
    { ok: true, status: 2 },
    { ok: true, status: 9 },
  ])('rejects malformed remove payload %#', async (payload) => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => (
      init?.method === 'DELETE' ? json(payload) : json({ needsAuth: false, status: 2 })
    )));
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: t.releases.vndbListRemove }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(screen.getAllByText(t.common.error).length).toBeGreaterThan(0));
  });

  it('silently settles an aborted removal', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') throw new DOMException('Aborted', 'AbortError');
      return json({ needsAuth: false, status: 2 });
    }));
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: t.releases.vndbListRemove }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(screen.getByRole('button', { name: t.releases.vndbListRemove })).toBeEnabled());
    expect(screen.queryByText(t.releases.vndbListRemoved)).not.toBeInTheDocument();
  });

  it('uses the localized fallback for a non-Error removal rejection', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') throw 'network failure';
      return json({ needsAuth: false, status: 2 });
    }));
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: t.releases.vndbListRemove }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(screen.getAllByText(t.common.error).length).toBeGreaterThan(0));
  });

  it('does not start removal when identity changes while confirmation is open', async () => {
    const fetchMock = vi.fn(async () => json({ needsAuth: false, status: 2 }));
    vi.stubGlobal('fetch', fetchMock);
    const view = renderPanel('r90001', 'v90001');
    fireEvent.click(await screen.findByRole('button', { name: t.releases.vndbListRemove }));
    const dialog = await screen.findByRole('alertdialog');
    view.rerender(<VndbReleaseListPanel releaseId="r90002" vnId="v90002" locallyOwned={false} />);
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(screen.getByLabelText(t.releases.vndbListStatusLabel)).toHaveValue('2'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not start removal after confirmation when a save is already active', async () => {
    const pendingSave = deferredResponse();
    const methods: string[] = [];
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      methods.push(init?.method ?? 'GET');
      return init?.method === 'PATCH'
        ? pendingSave.promise
        : Promise.resolve(json({ needsAuth: false, status: 1 }));
    }));
    renderPanel();
    const select = await screen.findByLabelText(t.releases.vndbListStatusLabel);
    fireEvent.change(select, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: t.releases.vndbListRemove }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: t.releases.vndbListSave }));
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(methods).toEqual(['GET', 'PATCH']));
    await act(async () => pendingSave.resolve(json({ ok: true, status: 2 })));
  });

  it('ignores a successful removal after the component identity changes', async () => {
    const pendingRemove = deferredResponse();
    let deleteStarted = false;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        deleteStarted = true;
        return pendingRemove.promise;
      }
      return Promise.resolve(json({ needsAuth: false, status: String(input).includes('r90001') ? 2 : 4 }));
    }));
    const view = renderPanel('r90001', 'v90001');
    fireEvent.click(await screen.findByRole('button', { name: t.releases.vndbListRemove }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(deleteStarted).toBe(true));
    view.rerender(<VndbReleaseListPanel releaseId="r90002" vnId="v90002" locallyOwned={false} />);
    await waitFor(() => expect(screen.getByLabelText(t.releases.vndbListStatusLabel)).toHaveValue('4'));
    await act(async () => pendingRemove.resolve(json({ ok: true, status: null })));
    expect(screen.getByLabelText(t.releases.vndbListStatusLabel)).toHaveValue('4');
    expect(screen.queryByText(t.releases.vndbListRemoved)).not.toBeInTheDocument();
  });

  it('localizes read failures and retries with a fresh request', async () => {
    const urls: string[] = [];
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      call += 1;
      return call === 1
        ? json({ error: 'hidden', code: 'upstream_unavailable' }, 502)
        : json({ needsAuth: false, status: 4 });
    }));
    renderPanel();
    expect(await screen.findByText(t.apiErrors.vndbUnavailable)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.common.retry }));
    await waitFor(() => expect(screen.getByLabelText(t.releases.vndbListStatusLabel)).toHaveValue('4'));
    expect(urls[1]).toContain('fresh=1');
  });

  it('surfaces malformed read payloads with the localized fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ needsAuth: false, status: 9 })));
    renderPanel();
    expect((await screen.findAllByText(t.common.error)).length).toBeGreaterThan(0);
  });

  it('uses the localized fallback for a non-Error read rejection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw { reason: 'offline' };
    }));
    renderPanel();
    await waitFor(() => expect(screen.getAllByText(t.common.error).length).toBeGreaterThan(0));
  });

  it('refreshes the current state from VNDB', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return json({ needsAuth: false, status: urls.length === 1 ? 0 : 4 });
    }));
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText(t.releases.vndbListStatusLabel)).toHaveValue('0'));
    fireEvent.click(screen.getByRole('button', { name: t.releases.vndbListRefresh }));
    await waitFor(() => expect(screen.getByLabelText(t.releases.vndbListStatusLabel)).toHaveValue('4'));
    expect(urls[1]).toContain('fresh=1');
  });

  it('localizes save and remove failures', async () => {
    let mutation: 'save' | 'remove' = 'save';
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return json({ error: 'hidden', code: 'vndb_listwrite_required' }, 401);
      }
      if (init?.method === 'DELETE') {
        mutation = 'remove';
        return json({ error: 'hidden', code: 'upstream_unavailable' }, 502);
      }
      return json({ needsAuth: false, status: 2 });
    }));
    renderPanel();
    const select = await screen.findByLabelText(t.releases.vndbListStatusLabel);
    fireEvent.change(select, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: t.releases.vndbListSave }));
    expect(await screen.findByText(t.apiErrors.vndbListwriteRequired)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t.releases.vndbListRemove }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.common.confirm }));
    expect(await screen.findByText(t.apiErrors.vndbUnavailable)).toBeInTheDocument();
    expect(mutation).toBe('remove');
  });

  it('ignores an obsolete read after the component identity changes', async () => {
    const first = deferredResponse();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => (
      String(input).includes('r90001')
        ? first.promise
        : Promise.resolve(json({ needsAuth: false, status: 4 }))
    )));
    const view = renderPanel('r90001', 'v90001');
    view.rerender(<VndbReleaseListPanel releaseId="r90002" vnId="v90002" locallyOwned={false} />);
    await waitFor(() => expect(screen.getByLabelText(t.releases.vndbListStatusLabel)).toHaveValue('4'));
    await act(async () => first.resolve(json({ needsAuth: false, status: 2 })));
    expect(screen.getByLabelText(t.releases.vndbListStatusLabel)).toHaveValue('4');
  });

  it('ignores stale mutation completions', async () => {
    const mutation = deferredResponse();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') return mutation.promise;
      if (String(input).includes('r90001')) return Promise.resolve(json({ needsAuth: false, status: 1 }));
      return Promise.resolve(json({ needsAuth: false, status: 4 }));
    }));
    const view = renderPanel('r90001', 'v90001');
    const select = await screen.findByLabelText(t.releases.vndbListStatusLabel);
    fireEvent.change(select, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: t.releases.vndbListSave }));
    view.rerender(<VndbReleaseListPanel releaseId="r90002" vnId="v90002" locallyOwned={false} />);
    await waitFor(() => expect(screen.getByLabelText(t.releases.vndbListStatusLabel)).toHaveValue('4'));
    await act(async () => mutation.resolve(json({ ok: true, status: 2 })));
    expect(screen.queryByText(t.releases.vndbListSaved)).not.toBeInTheDocument();
  });

  it('ignores a stale mutation rejection after identity changes', async () => {
    const mutation = deferredResponse();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') return mutation.promise;
      return Promise.resolve(json({ needsAuth: false, status: String(input).includes('r90001') ? 1 : 4 }));
    }));
    const view = renderPanel('r90001', 'v90001');
    const select = await screen.findByLabelText(t.releases.vndbListStatusLabel);
    fireEvent.change(select, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: t.releases.vndbListSave }));
    view.rerender(<VndbReleaseListPanel releaseId="r90002" vnId="v90002" locallyOwned={false} />);
    await waitFor(() => expect(screen.getByLabelText(t.releases.vndbListStatusLabel)).toHaveValue('4'));
    await act(async () => mutation.reject(new Error('obsolete')));
    expect(screen.queryByText('obsolete')).not.toBeInTheDocument();
  });

  it('treats a spontaneous AbortError as a silent cancelled load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new DOMException('Aborted', 'AbortError');
    }));
    const view = renderPanel();
    await waitFor(() => expect(view.container.querySelector('[data-vndb-release-list-skeleton]')).not.toBeInTheDocument());
    expect(screen.queryByText(t.common.error)).not.toBeInTheDocument();
  });
});
