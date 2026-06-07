// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { CoverUploader } from '@/components/CoverUploader';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;

function okResponse() {
  return new Response(JSON.stringify({ cover: 'cover/v90001.jpg' }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function errorResponse(msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'content-type': 'application/json' } });
}

function pickFile() {
  return new File(['bytes'], 'cover.png', { type: 'image/png' });
}

function fileInput(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('CoverUploader branches', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(okResponse());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the inline variant trigger with the upload CTA', () => {
    renderWithProviders(<CoverUploader vnId="v90001" hasCustom={false} variant="inline" />, { locale: 'en' });
    expect(screen.getByRole('button', { name: new RegExp(t.cover.uploadCta) })).toBeInTheDocument();
  });

  it('opens the hidden file input from the inline and card upload buttons', () => {
    const inline = renderWithProviders(<CoverUploader vnId="v90001" hasCustom={false} variant="inline" />, { locale: 'en' });
    const inlineInput = fileInput(inline.container);
    const inlineClick = vi.spyOn(inlineInput, 'click').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.cover.uploadCta) }));
    expect(inlineClick).toHaveBeenCalledTimes(1);
    inline.unmount();

    const card = renderWithProviders(<CoverUploader vnId="v90001" hasCustom={false} />, { locale: 'en' });
    const cardInput = fileInput(card.container);
    const cardClick = vi.spyOn(cardInput, 'click').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.cover.uploadCta) }));
    expect(cardClick).toHaveBeenCalledTimes(1);
  });

  it('uploads via the inline variant and shows the cover-saved toast on success', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { container } = renderWithProviders(<CoverUploader vnId="v90001" hasCustom variant="inline" />, { locale: 'en' });
    fireEvent.change(fileInput(container), { target: { files: [pickFile()] } });
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(true));
    await waitFor(() => expect(screen.getByText(t.toast.coverSaved)).toBeInTheDocument());
  });

  it('does nothing when the file input change carries no file', () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { container } = renderWithProviders(<CoverUploader vnId="v90001" hasCustom={false} />, { locale: 'en' });
    fireEvent.change(fileInput(container), { target: { files: [] } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores duplicate file changes while an upload is already pending', async () => {
    let resolveUpload: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveUpload = resolve; }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { container } = renderWithProviders(<CoverUploader vnId="v90001" hasCustom={false} />, { locale: 'en' });
    const input = fileInput(container);
    fireEvent.change(input, { target: { files: [pickFile()] } });
    fireEvent.change(input, { target: { files: [pickFile()] } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveUpload(okResponse());
    await waitFor(() => expect(screen.getByText(t.toast.coverSaved)).toBeInTheDocument());
  });

  it('resets the cover via DELETE and shows the cover-reset toast on success', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<CoverUploader vnId="v90001" hasCustom />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.cover.remove) }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(true));
    await waitFor(() => expect(screen.getByText(t.toast.coverReset)).toBeInTheDocument());
  });

  it('ignores duplicate cover removes while a remove is already pending', () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<CoverUploader vnId="v90001" hasCustom />, { locale: 'en' });
    const removeButton = screen.getByRole('button', { name: new RegExp(t.cover.remove) });
    act(() => {
      removeButton.click();
      removeButton.click();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces the inline error when the DELETE reset fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(errorResponse('reset boom'));
    const { container } = renderWithProviders(<CoverUploader vnId="v90001" hasCustom />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.cover.remove) }));
    await waitFor(() => expect(container.querySelector('p[role="alert"]')).not.toBeNull());
    expect(container.querySelector('p[role="alert"]')!.textContent).toContain('reset boom');
  });

  it('drops upload success and failure after unmount', async () => {
    let resolveUpload: (r: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveUpload = resolve; })) as unknown as typeof fetch;
    const successView = renderWithProviders(<CoverUploader vnId="v90001" hasCustom={false} />, { locale: 'en' });
    fireEvent.change(fileInput(successView.container), { target: { files: [pickFile()] } });
    successView.unmount();
    resolveUpload(okResponse());
    await Promise.resolve();
    expect(screen.queryByText(t.toast.coverSaved)).toBeNull();

    let resolveError: (r: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveError = resolve; })) as unknown as typeof fetch;
    const errorView = renderWithProviders(<CoverUploader vnId="v90001" hasCustom={false} />, { locale: 'en' });
    fireEvent.change(fileInput(errorView.container), { target: { files: [pickFile()] } });
    errorView.unmount();
    resolveError(errorResponse('stale upload boom'));
    await Promise.resolve();
    expect(screen.queryByText('stale upload boom')).toBeNull();
  });

  it('drops remove success and failure after unmount', async () => {
    let resolveRemove: (r: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveRemove = resolve; })) as unknown as typeof fetch;
    const successView = renderWithProviders(<CoverUploader vnId="v90001" hasCustom />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.cover.remove) }));
    successView.unmount();
    resolveRemove(okResponse());
    await flushMicrotasks();
    expect(screen.queryByText(t.toast.coverReset)).toBeNull();

    let resolveError: (r: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveError = resolve; })) as unknown as typeof fetch;
    const errorView = renderWithProviders(<CoverUploader vnId="v90001" hasCustom />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.cover.remove) }));
    errorView.unmount();
    resolveError(errorResponse('stale remove boom'));
    await flushMicrotasks();
    expect(screen.queryByText('stale remove boom')).toBeNull();
  });
});
