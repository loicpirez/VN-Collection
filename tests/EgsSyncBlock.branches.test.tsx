// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { EgsSyncBlock } from '@/components/EgsSyncBlock';
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

function deferredResponse() {
  let resolve!: (value: Response) => void;
  let reject!: (reason?: Error) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** One EGS sync suggestion row that passes decodeSuggestion. */
function suggestion(over: Record<string, unknown> = {}) {
  return {
    vn_id: 'v90001',
    vn_title: 'Title Y',
    egs_id: 555,
    egs_gamename: 'Game Y',
    local_minutes: 60,
    egs_minutes: 600,
    local_rating: null,
    egs_score: 88,
    egs_finish_date: '2024-02-03',
    egs_start_date: null,
    local_started_date: null,
    local_finished_date: null,
    ...over,
  };
}

interface Handlers {
  settings?: () => Promise<Response> | Response;
  computeGet?: () => Promise<Response> | Response;
  applyPost?: (body: unknown) => Promise<Response> | Response;
  settingsPatch?: (body: unknown) => Promise<Response> | Response;
}

function installFetch(h: Handlers) {
  global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u === '/api/settings' && (!init || !init.method || init.method === 'GET')) {
      return h.settings ? h.settings() : json({ egs_username: '' });
    }
    if (u === '/api/settings' && init?.method === 'PATCH') {
      return h.settingsPatch ? h.settingsPatch(JSON.parse(String(init.body))) : json({ ok: true });
    }
    if (u === '/api/egs/sync' && (!init || !init.method || init.method === 'GET')) {
      return h.computeGet ? h.computeGet() : json({ ok: true, needsConfig: false, suggestions: [] });
    }
    if (u === '/api/egs/sync' && init?.method === 'POST') {
      return h.applyPost ? h.applyPost(JSON.parse(String(init.body))) : json({ applied: 0 });
    }
    return json({});
  });
}

function render() {
  return renderWithProviders(<EgsSyncBlock />, { locale: 'en' });
}

describe('EgsSyncBlock branches', () => {
  beforeEach(() => {
    installFetch({});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('prefills the username from settings and leaves Save disabled until dirty', async () => {
    installFetch({ settings: () => json({ egs_username: 'uid42' }) });
    render();
    const input = (await screen.findByLabelText(t.egsSync.usernamePlaceholder)) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('uid42'));
    const saveBtn = screen.getByRole('button', { name: t.common.save });
    expect(saveBtn).toBeDisabled();
    // Compute enables once a non-empty username is loaded.
    expect(screen.getByRole('button', { name: t.egsSync.compute })).not.toBeDisabled();
  });

  it('handles missing, rejected, and late dirty username settings without clobbering input', async () => {
    installFetch({ settings: () => json({ error: 'settings blocked' }, 500) });
    const first = render();
    const blockedInput = (await screen.findByLabelText(t.egsSync.usernamePlaceholder)) as HTMLInputElement;
    await waitFor(() => expect(blockedInput).not.toBeDisabled());
    expect(blockedInput.value).toBe('');
    first.unmount();

    installFetch({ settings: () => json({ egs_username: 123 }) });
    const second = render();
    const invalidInput = (await screen.findByLabelText(t.egsSync.usernamePlaceholder)) as HTMLInputElement;
    await waitFor(() => expect(invalidInput).not.toBeDisabled());
    expect(invalidInput.value).toBe('');
    second.unmount();

    const pending = deferredResponse();
    installFetch({ settings: () => pending.promise });
    render();
    const dirtyInput = (await screen.findByLabelText(t.egsSync.usernamePlaceholder)) as HTMLInputElement;
    fireEvent.change(dirtyInput, { target: { value: 'local-edit' } });
    pending.resolve(json({ egs_username: 'remote-name' }));
    await waitFor(() => expect(dirtyInput.value).toBe('local-edit'));
  });

  it('ignores a username settings response that resolves after unmount', async () => {
    const pending = deferredResponse();
    installFetch({ settings: () => pending.promise });
    const view = render();
    await screen.findByLabelText(t.egsSync.usernamePlaceholder);
    view.unmount();
    await act(async () => {
      pending.resolve(json({ egs_username: 'late-name' }));
      await pending.promise;
    });
    expect(screen.queryByDisplayValue('late-name')).toBeNull();
  });

  it('marks the username dirty on edit and shows the unsaved warning', async () => {
    render();
    const input = await screen.findByLabelText(t.egsSync.usernamePlaceholder);
    fireEvent.change(input, { target: { value: 'newuser' } });
    expect(await screen.findByText(t.egsSync.unsavedWarning)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.common.save })).not.toBeDisabled();
  });

  it('saves the username and toasts success', async () => {
    let patched: unknown = null;
    installFetch({ settingsPatch: (body) => { patched = body; return json({ ok: true }); } });
    render();
    const input = await screen.findByLabelText(t.egsSync.usernamePlaceholder);
    fireEvent.change(input, { target: { value: 'savedname' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    await waitFor(() => expect(patched).toEqual({ egs_username: 'savedname' }));
    expect(await screen.findByText(t.toast.saved)).toBeInTheDocument();
  });

  it('saves a blank username as null and ignores duplicate save clicks while pending', async () => {
    const pending = deferredResponse();
    const bodies: unknown[] = [];
    installFetch({
      settingsPatch: (body) => {
        bodies.push(body);
        return pending.promise;
      },
    });
    render();
    const input = await screen.findByLabelText(t.egsSync.usernamePlaceholder);
    fireEvent.change(input, { target: { value: '   ' } });
    const save = screen.getByRole('button', { name: t.common.save });
    act(() => {
      save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => expect(bodies).toEqual([{ egs_username: null }]));
    pending.resolve(json({ ok: true }));
    expect(await screen.findByText(t.toast.saved)).toBeInTheDocument();
  });

  it('keeps the dirty warning when the username changes while save is pending', async () => {
    const pending = deferredResponse();
    installFetch({ settingsPatch: () => pending.promise });
    render();
    const input = await screen.findByLabelText(t.egsSync.usernamePlaceholder);
    fireEvent.change(input, { target: { value: 'first' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    fireEvent.change(input, { target: { value: 'second' } });
    pending.resolve(json({ ok: true }));
    await waitFor(() => expect((input as HTMLInputElement).value).toBe('second'));
    expect(screen.getByText(t.egsSync.unsavedWarning)).toBeInTheDocument();
  });

  it('ignores stale username save success and failure after unmount', async () => {
    const success = deferredResponse();
    installFetch({ settingsPatch: () => success.promise });
    const first = render();
    const firstInput = await screen.findByLabelText(t.egsSync.usernamePlaceholder);
    fireEvent.change(firstInput, { target: { value: 'late-success' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    first.unmount();
    success.resolve(json({ ok: true }));
    await success.promise;
    expect(screen.queryByText(t.toast.saved)).toBeNull();

    const failure = deferredResponse();
    installFetch({ settingsPatch: () => failure.promise });
    const second = render();
    const secondInput = await screen.findByLabelText(t.egsSync.usernamePlaceholder);
    fireEvent.change(secondInput, { target: { value: 'late-failure' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    second.unmount();
    failure.reject(new Error('late save failure'));
    await failure.promise.catch(() => undefined);
    expect(screen.queryByText('late save failure')).toBeNull();
  });

  it('shows a toast error when saving the username fails', async () => {
    installFetch({ settingsPatch: () => json({ error: 'save boom' }, 500) });
    render();
    const input = await screen.findByLabelText(t.egsSync.usernamePlaceholder);
    fireEvent.change(input, { target: { value: 'whoops' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    expect(await screen.findByText('save boom')).toBeInTheDocument();
  });

  it('computes suggestions, renders every diff row, and applies the selection', async () => {
    let appliedBody: unknown = null;
    installFetch({
      settings: () => json({ egs_username: 'uid42' }),
      computeGet: () => json({ ok: true, needsConfig: false, suggestions: [suggestion()] }),
      applyPost: (body) => { appliedBody = body; return json({ applied: 1 }); },
    });
    render();
    await waitFor(() => expect((screen.getByLabelText(t.egsSync.usernamePlaceholder) as HTMLInputElement).value).toBe('uid42'));
    fireEvent.click(screen.getByRole('button', { name: t.egsSync.compute }));

    // Title link rendered + the three diff fragments (playtime, score, finish date).
    expect(await screen.findByText('Title Y')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
    // Apply button appears with the picked count (1).
    const applyBtn = screen.getByRole('button', { name: t.egsSync.applySelected.replace('{count}', '1') });
    fireEvent.click(applyBtn);
    await waitFor(() => expect(appliedBody).toEqual({ vn_ids: ['v90001'] }));
    expect(await screen.findByText(`${t.egsSync.appliedSummary} (1)`)).toBeInTheDocument();
    // After apply, the suggestions list is cleared.
    await waitFor(() => expect(screen.queryByText('Title Y')).toBeNull());
  });

  it('ignores duplicate compute clicks and reports malformed preview payloads', async () => {
    const pending = deferredResponse();
    let computeCalls = 0;
    installFetch({
      settings: () => json({ egs_username: 'uid42' }),
      computeGet: () => {
        computeCalls += 1;
        return pending.promise;
      },
    });
    const first = render();
    const compute = await screen.findByRole('button', { name: t.egsSync.compute });
    act(() => {
      compute.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      compute.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => expect(computeCalls).toBe(1));
    pending.resolve(json({ ok: true, needsConfig: false, suggestions: [] }));
    await pending.promise;
    first.unmount();

    installFetch({
      settings: () => json({ egs_username: 'uid42' }),
      computeGet: () => json({ ok: true, suggestions: 'bad' }),
    });
    render();
    fireEvent.click(await screen.findByRole('button', { name: t.egsSync.compute }));
    expect(await screen.findByText(t.common.error)).toBeInTheDocument();
  });

  it('ignores stale compute success and failure after unmount', async () => {
    const success = deferredResponse();
    installFetch({
      settings: () => json({ egs_username: 'uid42' }),
      computeGet: () => success.promise,
    });
    const first = render();
    fireEvent.click(await screen.findByRole('button', { name: t.egsSync.compute }));
    first.unmount();
    success.resolve(json({ ok: true, needsConfig: false, suggestions: [suggestion()] }));
    await success.promise;
    expect(screen.queryByText('Title Y')).toBeNull();

    const failure = deferredResponse();
    installFetch({
      settings: () => json({ egs_username: 'uid42' }),
      computeGet: () => failure.promise,
    });
    const second = render();
    fireEvent.click(await screen.findByRole('button', { name: t.egsSync.compute }));
    second.unmount();
    failure.reject(new Error('late compute failure'));
    await failure.promise.catch(() => undefined);
    expect(screen.queryByText('late compute failure')).toBeNull();
  });

  it('toggles a pick off and disables Apply when none are selected', async () => {
    installFetch({
      settings: () => json({ egs_username: 'uid42' }),
      computeGet: () => json({ ok: true, needsConfig: false, suggestions: [suggestion()] }),
    });
    render();
    fireEvent.click(await screen.findByRole('button', { name: t.egsSync.compute }));
    const pickToggle = await screen.findByRole('button', { name: 'Title Y' });
    expect(pickToggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(pickToggle);
    await waitFor(() => expect(pickToggle).toHaveAttribute('aria-pressed', 'false'));
    const applyBtn = screen.getByRole('button', { name: t.egsSync.applySelected.replace('{count}', '0') });
    expect(applyBtn).toBeDisabled();
    // Re-select to cover the add branch of togglePick.
    fireEvent.click(pickToggle);
    await waitFor(() => expect(pickToggle).toHaveAttribute('aria-pressed', 'true'));
  });

  it('shows the needs-config notice when the preview flags it', async () => {
    installFetch({
      settings: () => json({ egs_username: 'uid42' }),
      computeGet: () => json({ ok: true, needsConfig: true, suggestions: [] }),
    });
    render();
    fireEvent.click(await screen.findByRole('button', { name: t.egsSync.compute }));
    expect(await screen.findByText(t.egsSync.needsConfig)).toBeInTheDocument();
  });

  it('surfaces a toast error when compute fails', async () => {
    installFetch({
      settings: () => json({ egs_username: 'uid42' }),
      computeGet: () => json({ error: 'compute boom' }, 500),
    });
    render();
    fireEvent.click(await screen.findByRole('button', { name: t.egsSync.compute }));
    expect(await screen.findByText('compute boom')).toBeInTheDocument();
  });

  it('surfaces a toast error when apply fails', async () => {
    installFetch({
      settings: () => json({ egs_username: 'uid42' }),
      computeGet: () => json({ ok: true, needsConfig: false, suggestions: [suggestion()] }),
      applyPost: () => json({ error: 'apply boom' }, 500),
    });
    render();
    fireEvent.click(await screen.findByRole('button', { name: t.egsSync.compute }));
    const applyBtn = await screen.findByRole('button', { name: t.egsSync.applySelected.replace('{count}', '1') });
    fireEvent.click(applyBtn);
    expect(await screen.findByText('apply boom')).toBeInTheDocument();
  });

  it('ignores duplicate apply clicks and reports malformed apply payloads', async () => {
    const pending = deferredResponse();
    let applyCalls = 0;
    installFetch({
      settings: () => json({ egs_username: 'uid42' }),
      computeGet: () => json({ ok: true, needsConfig: false, suggestions: [suggestion()] }),
      applyPost: () => {
        applyCalls += 1;
        return pending.promise;
      },
    });
    const first = render();
    fireEvent.click(await screen.findByRole('button', { name: t.egsSync.compute }));
    const apply = await screen.findByRole('button', { name: t.egsSync.applySelected.replace('{count}', '1') });
    act(() => {
      apply.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      apply.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await waitFor(() => expect(applyCalls).toBe(1));
    pending.resolve(json({ applied: 1 }));
    await pending.promise;
    first.unmount();

    installFetch({
      settings: () => json({ egs_username: 'uid42' }),
      computeGet: () => json({ ok: true, needsConfig: false, suggestions: [suggestion()] }),
      applyPost: () => json({ applied: 'bad' }),
    });
    render();
    fireEvent.click(await screen.findByRole('button', { name: t.egsSync.compute }));
    fireEvent.click(await screen.findByRole('button', { name: t.egsSync.applySelected.replace('{count}', '1') }));
    expect(await screen.findByText(t.common.error)).toBeInTheDocument();
  });

  it('ignores stale apply success and failure after unmount', async () => {
    const success = deferredResponse();
    installFetch({
      settings: () => json({ egs_username: 'uid42' }),
      computeGet: () => json({ ok: true, needsConfig: false, suggestions: [suggestion()] }),
      applyPost: () => success.promise,
    });
    const first = render();
    fireEvent.click(await screen.findByRole('button', { name: t.egsSync.compute }));
    fireEvent.click(await screen.findByRole('button', { name: t.egsSync.applySelected.replace('{count}', '1') }));
    first.unmount();
    success.resolve(json({ applied: 1 }));
    await success.promise;
    expect(screen.queryByText(`${t.egsSync.appliedSummary} (1)`)).toBeNull();

    const failure = deferredResponse();
    installFetch({
      settings: () => json({ egs_username: 'uid42' }),
      computeGet: () => json({ ok: true, needsConfig: false, suggestions: [suggestion()] }),
      applyPost: () => failure.promise,
    });
    const second = render();
    fireEvent.click(await screen.findByRole('button', { name: t.egsSync.compute }));
    fireEvent.click(await screen.findByRole('button', { name: t.egsSync.applySelected.replace('{count}', '1') }));
    second.unmount();
    failure.reject(new Error('late apply failure'));
    await failure.promise.catch(() => undefined);
    expect(screen.queryByText('late apply failure')).toBeNull();
  });

  it('renders the "show all" toggle past the preview limit and expands the list', async () => {
    const many = Array.from({ length: 62 }, (_, i) =>
      suggestion({ vn_id: `v9${String(1000 + i)}`, vn_title: `Title ${i}`, egs_id: 1000 + i }),
    );
    installFetch({
      settings: () => json({ egs_username: 'uid42' }),
      computeGet: () => json({ ok: true, needsConfig: false, suggestions: many }),
    });
    render();
    fireEvent.click(await screen.findByRole('button', { name: t.egsSync.compute }));
    // The 61st preview row (index 60) is hidden until "show all".
    await screen.findByText('Title 0');
    expect(screen.queryByText('Title 60')).toBeNull();
    const showAll = screen.getByRole('button', { name: `${t.steam.showAll} (2)` });
    fireEvent.click(showAll);
    expect(await screen.findByText('Title 60')).toBeInTheDocument();
    // Collapse again via show-less.
    fireEvent.click(screen.getByRole('button', { name: t.steam.showLess }));
    await waitFor(() => expect(screen.queryByText('Title 60')).toBeNull());
  }, 10000);

  it('keeps compute disabled until a username is present', async () => {
    installFetch({ settings: () => json({ egs_username: '' }) });
    render();
    await screen.findByLabelText(t.egsSync.usernamePlaceholder);
    expect(screen.getByRole('button', { name: t.egsSync.compute })).toBeDisabled();
  });
});
