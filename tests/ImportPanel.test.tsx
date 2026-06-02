// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportPanel } from '@/components/ImportPanel';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const confirmMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigationMocks,
}));

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

function jsonSummary(errors: string[] = []) {
  return {
    ok: true,
    summary: {
      vns_upserted: 1,
      collection_upserted: 2,
      series_created: 3,
      series_links: 4,
      errors,
    },
  };
}

function dbSummary(skipped: { name: string; reason: string }[] = []) {
  return {
    ok: true,
    summary: {
      tables: [{ name: 'vn', rows_replaced: 8 }],
      skipped,
    },
  };
}

function jsonFile(name = 'collection.json') {
  return new File(['{}'], name, { type: 'application/json' });
}

function dbFile(name = 'backup.db') {
  return new File(['SQLite format 3\0content'], name, { type: 'application/octet-stream' });
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}

function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('Missing file input');
  return input;
}

function panelRoot(container: HTMLElement): HTMLElement {
  const root = container.firstElementChild;
  if (!(root instanceof HTMLElement)) throw new Error('Missing import panel');
  return root;
}

beforeEach(() => {
  navigationMocks.refresh.mockReset();
  confirmMocks.confirm.mockReset();
  confirmMocks.confirm.mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ImportPanel', () => {
  it('supports picker clicks and drag state without uploading missing files', () => {
    const { container } = renderWithProviders(<ImportPanel />, { locale: 'en' });
    const input = fileInput(container);
    const root = panelRoot(container);
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: t.dataMgmt.importJson }));
    expect(click).toHaveBeenCalledTimes(1);

    fireEvent.dragOver(root);
    expect(root).toHaveClass('border-accent');
    fireEvent.dragLeave(root);
    expect(root).toHaveClass('border-border');
    fireEvent.drop(root, { dataTransfer: { files: [] } });
    fireEvent.change(input, { target: { files: [] } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('imports JSON from a drop and renders count plus error details', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(jsonSummary(['skipped row'])));
    const { container } = renderWithProviders(<ImportPanel />, { locale: 'en' });
    fireEvent.drop(panelRoot(container), { dataTransfer: { files: [jsonFile()] } });

    expect(await screen.findByText(t.dataMgmt.importDone)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/collection/import', expect.objectContaining({ method: 'POST' }));
    expect(screen.getByText(`1 ${t.dataMgmt.importCounts.errors}`)).toBeInTheDocument();
    expect(screen.getByText('skipped row')).toBeInTheDocument();
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('imports JSON from the picker without rendering empty error details', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(jsonSummary()));
    const { container } = renderWithProviders(<ImportPanel />, { locale: 'en' });
    fireEvent.change(fileInput(container), { target: { files: [jsonFile()] } });

    expect(await screen.findByText(t.dataMgmt.importDone)).toBeInTheDocument();
    expect(screen.queryByText(t.dataMgmt.importCounts.errors)).not.toBeInTheDocument();
  });

  it('confirms database restores, supports cancellation, and renders skipped tables', async () => {
    confirmMocks.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    vi.mocked(fetch).mockResolvedValue(jsonResponse(dbSummary([{ name: 'cache', reason: 'missing' }])));
    const { container } = renderWithProviders(<ImportPanel />, { locale: 'en' });
    const input = fileInput(container);
    fireEvent.change(input, { target: { files: [dbFile()] } });
    await flushAsync();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { files: [dbFile('second.db')] } });
    expect(await screen.findByText(t.dataMgmt.restoreDone)).toBeInTheDocument();
    expect(confirmMocks.confirm).toHaveBeenLastCalledWith({
      message: t.dataMgmt.restoreConfirm,
      tone: 'danger',
      requireTyping: 'RESTORE',
    });
    expect(fetch).toHaveBeenCalledWith('/api/backup/restore', expect.objectContaining({ method: 'POST' }));
    expect(screen.getByText(`1 ${t.dataMgmt.restoreSkipped}`)).toBeInTheDocument();
    expect(screen.getByText('cache: missing')).toBeInTheDocument();
  });

  it('reports HTTP, malformed JSON, malformed database, and network failures', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'import failed' }, 500))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockRejectedValueOnce(new Error('network failed'));
    const first = renderWithProviders(<ImportPanel />, { locale: 'en' });
    const input = fileInput(first.container);
    fireEvent.change(input, { target: { files: [jsonFile()] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('import failed');
    fireEvent.change(input, { target: { files: [jsonFile('malformed.json')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(t.dataMgmt.importError);
    fireEvent.change(input, { target: { files: [dbFile()] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(t.dataMgmt.importError);
    fireEvent.change(input, { target: { files: [jsonFile('network.json')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('network failed');
  });

  it('aborts replaced and unmounted uploads and ignores stale restore confirmations', async () => {
    const firstUpload = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(firstUpload.promise)
      .mockResolvedValueOnce(jsonResponse(jsonSummary()));
    const first = renderWithProviders(<ImportPanel />, { locale: 'en' });
    const input = fileInput(first.container);
    fireEvent.change(input, { target: { files: [jsonFile('first.json')] } });
    await flushAsync();
    const firstSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    fireEvent.change(input, { target: { files: [jsonFile('second.json')] } });
    expect(firstSignal?.aborted).toBe(true);
    expect(await screen.findByText(t.dataMgmt.importDone)).toBeInTheDocument();
    await act(async () => firstUpload.resolve(jsonResponse(jsonSummary())));
    first.unmount();

    const upload = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(upload.promise);
    const second = renderWithProviders(<ImportPanel />, { locale: 'en' });
    fireEvent.change(fileInput(second.container), { target: { files: [jsonFile()] } });
    await flushAsync();
    const uploadSignal = vi.mocked(fetch).mock.calls[2]?.[1]?.signal;
    second.unmount();
    expect(uploadSignal?.aborted).toBe(true);
    await act(async () => upload.reject(new Error('late failure')));

    const confirmation = deferred<boolean>();
    confirmMocks.confirm.mockReturnValueOnce(confirmation.promise);
    const third = renderWithProviders(<ImportPanel />, { locale: 'en' });
    fireEvent.change(fileInput(third.container), { target: { files: [dbFile()] } });
    third.unmount();
    await act(async () => confirmation.resolve(true));
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
