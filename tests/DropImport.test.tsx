// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DropImport } from '@/components/DropImport';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

const confirmMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigationMocks,
}));

vi.mock('@/components/ToastProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ToastProvider')>();
  return {
    ...actual,
    useToast: () => toastMocks,
  };
});

vi.mock('@/components/ConfirmDialog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ConfirmDialog')>();
  return {
    ...actual,
    useConfirm: () => confirmMocks,
  };
});

const t = dictionaries.en;

function jsonResponse(payload: unknown = { ok: true }, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: Error) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (reason?: Error) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function transfer(files: Array<File | undefined> = [], types: string[] = ['Files']): DataTransfer {
  return { files, types } as unknown as DataTransfer;
}

function dispatchDrag(type: string, dataTransfer?: DataTransfer): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  if (dataTransfer) Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  act(() => document.dispatchEvent(event));
  return event;
}

beforeEach(() => {
  navigationMocks.refresh.mockReset();
  toastMocks.error.mockReset();
  toastMocks.success.mockReset();
  confirmMocks.confirm.mockReset();
  confirmMocks.confirm.mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DropImport', () => {
  it('shows the overlay only while file drag depth remains positive', () => {
    renderWithProviders(<DropImport />, { locale: 'en' });
    dispatchDrag('dragenter');
    dispatchDrag('dragenter', transfer([], ['text/plain']));
    expect(screen.queryByText(t.dropImport.title)).not.toBeInTheDocument();

    dispatchDrag('dragenter', transfer());
    dispatchDrag('dragenter', transfer());
    expect(screen.getByText(t.dropImport.title)).toBeInTheDocument();
    dispatchDrag('dragleave');
    expect(screen.getByText(t.dropImport.title)).toBeInTheDocument();
    dispatchDrag('dragleave');
    dispatchDrag('dragleave');
    expect(screen.queryByText(t.dropImport.title)).not.toBeInTheDocument();
  });

  it('prevents file dragover but ignores dragover and drops without files', () => {
    renderWithProviders(<DropImport />, { locale: 'en' });
    expect(dispatchDrag('dragover', transfer([], ['text/plain'])).defaultPrevented).toBe(false);
    expect(dispatchDrag('dragover', transfer()).defaultPrevented).toBe(true);
    expect(dispatchDrag('drop', transfer()).defaultPrevented).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects unsupported and malformed dropped files', () => {
    renderWithProviders(<DropImport />, { locale: 'en' });
    expect(dispatchDrag('drop', transfer([undefined])).defaultPrevented).toBe(true);
    dispatchDrag('drop', transfer([new File(['x'], 'cover.png')]));
    expect(toastMocks.error).toHaveBeenCalledWith(t.dropImport.unsupported);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('imports JSON, displays progress, refreshes, and suppresses duplicate drops', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    renderWithProviders(<DropImport />, { locale: 'en' });
    dispatchDrag('drop', transfer([new File(['{}'], 'collection.JSON')]));
    dispatchDrag('drop', transfer([new File(['{}'], 'second.json')]));
    expect(screen.getByText(t.dropImport.importing)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/collection/import', expect.objectContaining({ method: 'POST' }));

    await act(async () => pending.resolve(jsonResponse()));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith(t.dropImport.ok));
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(t.dropImport.importing)).not.toBeInTheDocument();
  });

  it('confirms database restore, supports cancellation, and uses the restore endpoint', async () => {
    confirmMocks.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    vi.mocked(fetch).mockResolvedValue(jsonResponse());
    renderWithProviders(<DropImport />, { locale: 'en' });
    dispatchDrag('drop', transfer([new File(['db'], 'backup.db')]));
    await waitFor(() => expect(confirmMocks.confirm).toHaveBeenCalledTimes(1));
    expect(fetch).not.toHaveBeenCalled();

    dispatchDrag('drop', transfer([new File(['db'], 'backup.sqlite')]));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/backup/restore', expect.objectContaining({ method: 'POST' })));
    expect(confirmMocks.confirm).toHaveBeenLastCalledWith({
      message: t.dropImport.dbConfirm.replace('{name}', 'backup.sqlite'),
      tone: 'danger',
      requireTyping: 'RESTORE',
    });
  });

  it('reports HTTP failures and ignores AbortError failures', async () => {
    const aborted = new Error('aborted');
    aborted.name = 'AbortError';
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'import failed' }, 500))
      .mockRejectedValueOnce(aborted);
    renderWithProviders(<DropImport />, { locale: 'en' });
    dispatchDrag('drop', transfer([new File(['{}'], 'first.json')]));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('import failed'));

    dispatchDrag('drop', transfer([new File(['{}'], 'second.json')]));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(toastMocks.error).toHaveBeenCalledTimes(1);
  });

  it('aborts and ignores stale confirmation and upload completions after teardown', async () => {
    const confirmation = deferred<boolean>();
    confirmMocks.confirm.mockReturnValue(confirmation.promise);
    const first = renderWithProviders(<DropImport />, { locale: 'en' });
    dispatchDrag('drop', transfer([new File(['db'], 'backup.db')]));
    first.unmount();
    await act(async () => confirmation.resolve(true));
    expect(fetch).not.toHaveBeenCalled();

    const upload = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(upload.promise);
    const second = renderWithProviders(<DropImport />, { locale: 'en' });
    dispatchDrag('drop', transfer([new File(['{}'], 'collection.json')]));
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    second.unmount();
    expect(request?.signal?.aborted).toBe(true);
    await act(async () => upload.resolve(jsonResponse()));
    expect(toastMocks.success).not.toHaveBeenCalled();

    const failure = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(failure.promise);
    const third = renderWithProviders(<DropImport />, { locale: 'en' });
    dispatchDrag('drop', transfer([new File(['{}'], 'second.json')]));
    third.unmount();
    await act(async () => failure.reject(new Error('late failure')));
    expect(toastMocks.error).not.toHaveBeenCalled();
  });
});
