// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('resets the cover via DELETE and shows the cover-reset toast on success', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<CoverUploader vnId="v90001" hasCustom />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.cover.remove) }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(true));
    await waitFor(() => expect(screen.getByText(t.toast.coverReset)).toBeInTheDocument());
  });

  it('surfaces the inline error when the DELETE reset fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(errorResponse('reset boom'));
    const { container } = renderWithProviders(<CoverUploader vnId="v90001" hasCustom />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.cover.remove) }));
    await waitFor(() => expect(container.querySelector('p[role="alert"]')).not.toBeNull());
    expect(container.querySelector('p[role="alert"]')!.textContent).toContain('reset boom');
  });
});
