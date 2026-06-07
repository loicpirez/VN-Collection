// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { BannerControls } from '@/components/BannerControls';
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
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
}

function errorResponse(msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'content-type': 'application/json' } });
}

function bannerFile() {
  return new File(['bytes'], 'banner.png', { type: 'image/png' });
}

function fileInput(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('BannerControls branches', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(okResponse());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the inline variant with upload and reset when a custom banner exists', () => {
    renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner variant="inline" />, { locale: 'en' });
    expect(screen.getByRole('button', { name: new RegExp(t.banner.uploadCta) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(t.banner.reset) })).toBeInTheDocument();
  });

  it('opens the hidden file input from the inline and card upload buttons', () => {
    const inline = renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner={false} variant="inline" />, { locale: 'en' });
    const inlineInput = fileInput(inline.container);
    const inlineClick = vi.spyOn(inlineInput, 'click').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.banner.uploadCta) }));
    expect(inlineClick).toHaveBeenCalledTimes(1);
    inline.unmount();

    const card = renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner={false} />, { locale: 'en' });
    const cardInput = fileInput(card.container);
    const cardClick = vi.spyOn(cardInput, 'click').mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.banner.uploadCta) }));
    expect(cardClick).toHaveBeenCalledTimes(1);
  });

  it('uploads via the inline variant and shows the banner-saved toast', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { container } = renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner={false} variant="inline" />, { locale: 'en' });
    fireEvent.change(fileInput(container), { target: { files: [bannerFile()] } });
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(true));
    await waitFor(() => expect(screen.getByText(t.toast.bannerSaved)).toBeInTheDocument());
  });

  it('resets the banner via DELETE in the inline variant and shows the reset toast', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner variant="inline" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.banner.reset) }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(true));
    await waitFor(() => expect(screen.getByText(t.toast.bannerReset)).toBeInTheDocument());
  });

  it('ignores duplicate banner resets while a reset is already pending', () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner />, { locale: 'en' });
    const resetButton = screen.getByRole('button', { name: new RegExp(t.banner.reset) });
    act(() => {
      resetButton.click();
      resetButton.click();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the file change carries no file', () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { container } = renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner={false} />, { locale: 'en' });
    fireEvent.change(fileInput(container), { target: { files: [] } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores duplicate file changes while an upload is already pending', async () => {
    let resolveUpload: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveUpload = resolve; }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { container } = renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner={false} />, { locale: 'en' });
    const input = fileInput(container);
    fireEvent.change(input, { target: { files: [bannerFile()] } });
    fireEvent.change(input, { target: { files: [bannerFile()] } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveUpload(okResponse());
    await waitFor(() => expect(screen.getByText(t.toast.bannerSaved)).toBeInTheDocument());
  });

  it('renders the card-variant error alert when the reset DELETE fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(errorResponse('card reset boom'));
    const { container } = renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.banner.reset) }));
    await waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('card reset boom');
  });

  it('drops upload success and failure after unmount', async () => {
    let resolveUpload: (r: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveUpload = resolve; })) as unknown as typeof fetch;
    const successView = renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner={false} />, { locale: 'en' });
    fireEvent.change(fileInput(successView.container), { target: { files: [bannerFile()] } });
    successView.unmount();
    resolveUpload(okResponse());
    await Promise.resolve();
    expect(screen.queryByText(t.toast.bannerSaved)).toBeNull();

    let resolveError: (r: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveError = resolve; })) as unknown as typeof fetch;
    const errorView = renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner={false} />, { locale: 'en' });
    fireEvent.change(fileInput(errorView.container), { target: { files: [bannerFile()] } });
    errorView.unmount();
    resolveError(errorResponse('stale banner upload boom'));
    await Promise.resolve();
    expect(screen.queryByText('stale banner upload boom')).toBeNull();
  });

  it('drops reset success and failure after unmount', async () => {
    let resolveReset: (r: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveReset = resolve; })) as unknown as typeof fetch;
    const successView = renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.banner.reset) }));
    successView.unmount();
    resolveReset(okResponse());
    await flushMicrotasks();
    expect(screen.queryByText(t.toast.bannerReset)).toBeNull();

    let resolveError: (r: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveError = resolve; })) as unknown as typeof fetch;
    const errorView = renderWithProviders(<BannerControls vnId="v90001" hasCustomBanner />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.banner.reset) }));
    errorView.unmount();
    resolveError(errorResponse('stale banner reset boom'));
    await flushMicrotasks();
    expect(screen.queryByText('stale banner reset boom')).toBeNull();
  });
});
