// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { VndbLocalImportPanel } from '@/components/VndbLocalImportPanel';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const t = dictionaries.en;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function candidate(index: number, kind: 'vn' | 'release' = 'vn') {
  const vnId = `v${90000 + index}`;
  return kind === 'vn'
    ? { kind, key: `vn:${vnId}`, vn_id: vnId, title: `Title ${index}`, local_status: 'planning' }
    : {
        kind,
        key: `release:r${90000 + index}`,
        vn_id: vnId,
        release_id: `r${90000 + index}`,
        title: `Title ${index}`,
        edition_label: index % 2 ? `Edition ${index}` : null,
        remote_status: index % 2 ? 1 : null,
      };
}

function preview(
  candidates = [candidate(1), candidate(2, 'release')],
  options: { canApply?: boolean; ineligible?: unknown[] } = {},
) {
  return {
    ok: true,
    action: 'preview',
    needsAuth: false,
    canApply: options.canApply ?? true,
    candidates,
    ineligible: options.ineligible ?? [],
    summary: {
      scanned_vns: 3,
      scanned_releases: 2,
      already_in_vndb: 1,
      already_obtained: 1,
      ineligible: options.ineligible?.length ?? 0,
    },
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('VndbLocalImportPanel', () => {
  it('creates a paginated preview with game, edition, and ineligible details', async () => {
    const candidates = Array.from({ length: 26 }, (_, index) => candidate(index + 1, index === 2 ? 'release' : 'vn'));
    const payload = preview(candidates, {
      ineligible: [
        { kind: 'vn', key: 'vn:egs_90001', vn_id: 'egs_90001', release_id: null, title: 'Needs mapping', reason: 'unmapped_vn' },
        { kind: 'release', key: 'release:synthetic:v90002', vn_id: 'v90002', release_id: 'synthetic:v90002', title: 'Synthetic edition', reason: 'synthetic_release' },
      ],
    });
    const fetchMock = vi.fn(async () => json(payload));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<VndbLocalImportPanel />, { locale: 'en' });

    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportCompare }));
    expect(await screen.findByText('Title 1')).toBeInTheDocument();
    expect(screen.getByText(`${t.settings.vndbImportEdition}: Edition 3`)).toBeInTheDocument();
    expect(screen.getByText(t.releases.vndbListStatuses.pending)).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.common.next }));
    expect(await screen.findByText('Title 26')).toBeInTheDocument();
    const lastCheckbox = screen.getByRole('checkbox', {
      name: t.settings.vndbImportSelectItem.replace('{title}', 'Title 26'),
    });
    fireEvent.click(lastCheckbox);
    expect(screen.getByText(t.settings.vndbImportSelected.replace('{count}', '1'))).toBeInTheDocument();
    fireEvent.click(lastCheckbox);
    expect(screen.getByText(t.settings.vndbImportSelected.replace('{count}', '0'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.common.prev }));
    expect(await screen.findByText('Title 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportSelectAll }));
    expect(screen.getByText(t.settings.vndbImportSelected.replace('{count}', '26'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportClear }));
    expect(screen.getByText(t.settings.vndbImportSelected.replace('{count}', '0'))).toBeInTheDocument();

    fireEvent.click(screen.getByText(t.settings.vndbImportIneligible.replace('{count}', '2')));
    expect(screen.getByText(t.settings.vndbImportUnmapped)).toBeInTheDocument();
    expect(screen.getByText(t.settings.vndbImportSyntheticRelease)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('disables applying when the token has no list-write permission', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(preview([candidate(1)], { canApply: false }))));
    renderWithProviders(<VndbLocalImportPanel />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportCompare }));
    expect(await screen.findByText(t.settings.vndbImportWritePermission)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportSelectAll }));
    expect(screen.getByRole('button', { name: t.settings.vndbImportApply })).toBeDisabled();
  });

  it('applies selections in bounded batches, refreshes, and retains retryable issues', async () => {
    const initial = Array.from({ length: 26 }, (_, index) => candidate(index + 1, index === 1 ? 'release' : 'vn'));
    const retryCandidates = [initial[0], initial[1]];
    const bodies: Array<Record<string, unknown>> = [];
    let previewCalls = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      if (body.action === 'preview') {
        previewCalls += 1;
        return json(preview(previewCalls === 1 ? initial : retryCandidates));
      }
      const selections = body.selections as Array<{ kind: string; vn_id: string; release_id?: string }>;
      if (selections.length === 25) {
        return json({
          ok: true,
          action: 'apply',
          needsAuth: false,
          applied: selections.slice(2).map((selection) => selection.kind === 'vn' ? `vn:${selection.vn_id}` : `release:${selection.release_id}`),
          conflicts: [{ key: initial[0].key, reason: 'local_changed' }],
          failures: [{ key: initial[1].key, code: 'vndb_write_failed' }],
        });
      }
      return json({
        ok: true,
        action: 'apply',
        needsAuth: false,
        applied: [`vn:${selections[0].vn_id}`],
        conflicts: [],
        failures: [],
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<VndbLocalImportPanel />, { locale: 'en' });

    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportCompare }));
    await screen.findByText('Title 1');
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportSelectAll }));
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportApply }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.confirm }));

    expect(await screen.findByText(t.settings.vndbImportIssues.replace('{count}', '2'))).toBeInTheDocument();
    expect(screen.getByText(t.settings.vndbImportConflictLocalChanged)).toBeInTheDocument();
    expect(screen.getByText(t.settings.vndbImportWriteFailed)).toBeInTheDocument();
    expect(screen.getByText(t.settings.vndbImportSelected.replace('{count}', '2'))).toBeInTheDocument();
    const applyBodies = bodies.filter((body) => body.action === 'apply');
    expect((applyBodies[0].selections as unknown[])).toHaveLength(25);
    expect((applyBodies[1].selections as unknown[])).toHaveLength(1);
    expect(bodies.at(-1)).toEqual({ action: 'preview' });
  });

  it('does not apply when confirmation is canceled', async () => {
    const fetchMock = vi.fn(async () => json(preview([candidate(1)])));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<VndbLocalImportPanel />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportCompare }));
    await screen.findByText('Title 1');
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportSelectAll }));
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportApply }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.cancel }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows no-change, permission, malformed-response, and network errors', async () => {
    const responses = [
      json(preview([])),
      json({ ok: false, action: 'preview', needsAuth: false, errorCode: 'vndb_list_read_permission_required' }, 403),
      json({ malformed: true }),
    ];
    const fetchMock = vi.fn(async () => responses.shift() ?? Promise.reject(new Error('Network unavailable')));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<VndbLocalImportPanel />, { locale: 'en' });

    const compare = screen.getByRole('button', { name: t.settings.vndbImportCompare });
    fireEvent.click(compare);
    expect(await screen.findByText(t.settings.vndbImportNoChanges)).toBeInTheDocument();
    fireEvent.click(compare);
    expect(await screen.findByText(t.settings.vndbImportReadPermission)).toBeInTheDocument();
    fireEvent.click(compare);
    expect(await screen.findByText(t.common.error)).toBeInTheDocument();
    fireEvent.click(compare);
    expect(await screen.findByText('Network unavailable')).toBeInTheDocument();
  });

  it('maps token and write permissions and rejects invalid HTTP or action responses', async () => {
    const responses = [
      json({ ok: false, action: 'preview', needsAuth: true, errorCode: 'vndb_token_required' }, 401),
      json({ ok: false, action: 'preview', needsAuth: false, errorCode: 'vndb_list_write_permission_required' }, 403),
      json(preview([candidate(1)]), 500),
      new Response('not-json', { status: 200 }),
      json({ ok: true, action: 'apply', needsAuth: false, applied: [], conflicts: [], failures: [] }),
    ];
    vi.stubGlobal('fetch', vi.fn(async () => responses.shift() as Response));
    renderWithProviders(<VndbLocalImportPanel />, { locale: 'en' });
    const compare = screen.getByRole('button', { name: t.settings.vndbImportCompare });

    fireEvent.click(compare);
    expect(await screen.findByText(t.apiErrors.vndbTokenRequired)).toBeInTheDocument();
    await waitFor(() => expect(compare).toBeEnabled());
    fireEvent.click(compare);
    expect(await screen.findByText(t.settings.vndbImportWritePermission)).toBeInTheDocument();
    await waitFor(() => expect(compare).toBeEnabled());

    for (let index = 1; index <= 3; index += 1) {
      fireEvent.click(compare);
      await waitFor(() => expect(screen.getAllByText(t.common.error)).toHaveLength(index));
      await waitFor(() => expect(compare).toBeEnabled());
    }
  });

  it('renders determinate progress while an apply request is pending', async () => {
    const apply = deferred<Response>();
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      call += 1;
      if (call === 1) return json(preview([candidate(1)]));
      if (call === 2) return apply.promise;
      return json(preview([]));
    }));
    renderWithProviders(<VndbLocalImportPanel />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportCompare }));
    await screen.findByText('Title 1');
    fireEvent.click(screen.getByRole('checkbox', {
      name: t.settings.vndbImportSelectItem.replace('{title}', 'Title 1'),
    }));
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportApply }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.common.confirm }));

    const progressbar = await screen.findByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuemin', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '1');
    expect(progressbar).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('0 / 1 (0%)')).toBeInTheDocument();

    await act(async () => {
      apply.resolve(json({
        ok: true,
        action: 'apply',
        needsAuth: false,
        applied: ['vn:v90001'],
        conflicts: [],
        failures: [],
      }));
    });
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
    expect(screen.getByText(t.settings.vndbImportNoChanges)).toBeInTheDocument();
  });

  it('shows every conflict class, token failure, and fallback identity after a later batch fails', async () => {
    const initial = Array.from({ length: 26 }, (_, index) => candidate(index + 1, index === 1 ? 'release' : 'vn'));
    let applyCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { action: string };
      if (body.action === 'preview') return json(preview(initial));
      applyCalls += 1;
      if (applyCalls === 1) {
        return json({
          ok: true,
          action: 'apply',
          needsAuth: false,
          applied: [],
          conflicts: [
            { key: initial[0].key, reason: 'local_missing' },
            { key: 'vn:v99999', reason: 'remote_changed' },
          ],
          failures: [{ key: 'release:r99998', code: 'vndb_token_required' }],
        });
      }
      return Promise.reject('upstream stopped');
    }));
    renderWithProviders(<VndbLocalImportPanel />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportCompare }));
    await screen.findByText('Title 1');
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportSelectAll }));
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportApply }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.common.confirm }));

    expect(await screen.findByText(t.settings.vndbImportIssues.replace('{count}', '3'))).toBeInTheDocument();
    expect(screen.getByText(t.settings.vndbImportConflictLocalMissing)).toBeInTheDocument();
    expect(screen.getByText(t.settings.vndbImportConflictRemoteChanged)).toBeInTheDocument();
    expect(screen.getByText(t.apiErrors.vndbTokenRequired)).toBeInTheDocument();
    expect(screen.getByText('vn:v99999')).toBeInTheDocument();
    expect(screen.getByText('release:r99998')).toBeInTheDocument();
    expect(screen.getByText(t.common.error)).toBeInTheDocument();
  });

  it('uses the generic message for a non-Error preview rejection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject('offline')));
    renderWithProviders(<VndbLocalImportPanel />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportCompare }));
    expect(await screen.findByText(t.common.error)).toBeInTheDocument();
  });

  it('rejects an apply payload with the wrong action', async () => {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      call += 1;
      return call === 1
        ? json(preview([candidate(1)]))
        : json(preview([]));
    }));
    renderWithProviders(<VndbLocalImportPanel />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportCompare }));
    await screen.findByText('Title 1');
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportSelectAll }));
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportApply }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.common.confirm }));
    expect(await screen.findByText(t.common.error)).toBeInTheDocument();
  });

  it('rejects a refresh payload with the wrong action', async () => {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      call += 1;
      if (call === 1) return json(preview([candidate(1)]));
      return json({ ok: true, action: 'apply', needsAuth: false, applied: ['vn:v90001'], conflicts: [], failures: [] });
    }));
    renderWithProviders(<VndbLocalImportPanel />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportCompare }));
    await screen.findByText('Title 1');
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportSelectAll }));
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportApply }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.common.confirm }));
    expect(await screen.findByText(t.common.error)).toBeInTheDocument();
  });

  it('does not start applying when the panel unmounts during confirmation', async () => {
    const fetchMock = vi.fn(async () => json(preview([candidate(1)])));
    vi.stubGlobal('fetch', fetchMock);
    const view = renderWithProviders(<VndbLocalImportPanel />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportCompare }));
    await screen.findByText('Title 1');
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportSelectAll }));
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportApply }));
    const dialog = await screen.findByRole('alertdialog');
    view.rerender(<div>Closed settings</div>);
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts an in-flight preview when unmounted', async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }, { once: true });
      });
    }));
    const view = renderWithProviders(<VndbLocalImportPanel />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportCompare }));
    await act(async () => undefined);
    view.unmount();
    expect(capturedSignal?.aborted).toBe(true);
    await act(async () => undefined);
  });

  it('ignores a preview response that resolves after unmount', async () => {
    const pending = deferred<Response>();
    let capturedSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return pending.promise;
    }));
    const view = renderWithProviders(<VndbLocalImportPanel />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportCompare }));
    await act(async () => undefined);
    view.unmount();
    await act(async () => {
      pending.resolve(json(preview([candidate(1)])));
    });
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('ignores an apply response that resolves after unmount', async () => {
    const pending = deferred<Response>();
    let capturedSignal: AbortSignal | undefined;
    let call = 0;
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      call += 1;
      if (call === 1) return Promise.resolve(json(preview([candidate(1)])));
      capturedSignal = init?.signal ?? undefined;
      return pending.promise;
    }));
    const view = renderWithProviders(<VndbLocalImportPanel />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportCompare }));
    await screen.findByText('Title 1');
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportSelectAll }));
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportApply }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.common.confirm }));
    await screen.findByRole('progressbar');
    view.unmount();
    await act(async () => {
      pending.resolve(json({
        ok: true,
        action: 'apply',
        needsAuth: false,
        applied: ['vn:v90001'],
        conflicts: [],
        failures: [],
      }));
    });
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('ignores a refreshed preview that resolves after unmount', async () => {
    const pending = deferred<Response>();
    let capturedSignal: AbortSignal | undefined;
    let call = 0;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      call += 1;
      if (call === 1) return Promise.resolve(json(preview([candidate(1)])));
      if (call === 2) {
        return Promise.resolve(json({
          ok: true,
          action: 'apply',
          needsAuth: false,
          applied: ['vn:v90001'],
          conflicts: [],
          failures: [],
        }));
      }
      capturedSignal = init?.signal ?? undefined;
      return pending.promise;
    });
    vi.stubGlobal('fetch', fetchMock);
    const view = renderWithProviders(<VndbLocalImportPanel />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportCompare }));
    await screen.findByText('Title 1');
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportSelectAll }));
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportApply }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    view.unmount();
    await act(async () => {
      pending.resolve(json(preview([])));
    });
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('silently handles an aborted apply request', async () => {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      call += 1;
      if (call === 1) return Promise.resolve(json(preview([candidate(1)])));
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }, { once: true });
      });
    }));
    const view = renderWithProviders(<VndbLocalImportPanel />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportCompare }));
    await screen.findByText('Title 1');
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportSelectAll }));
    fireEvent.click(screen.getByRole('button', { name: t.settings.vndbImportApply }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: t.common.confirm }));
    await screen.findByRole('progressbar');
    view.unmount();
    await act(async () => undefined);
  });
});
