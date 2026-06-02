// @vitest-environment jsdom
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

const t = dictionaries.fr;

function okResponse() {
  return new Response(JSON.stringify({ cover: 'cover/v90001.jpg' }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function pickFile() {
  return new File(['bytes'], 'cover.png', { type: 'image/png' });
}

describe('CoverUploader', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(okResponse());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the card variant with title, hint and upload button (no remove without custom)', () => {
    renderWithProviders(<CoverUploader vnId="v90001" hasCustom={false} />);
    expect(screen.getByText(t.cover.title)).toBeTruthy();
    expect(screen.getByText(t.cover.hint)).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(t.cover.uploadCta) })).toBeTruthy();
    expect(screen.queryByRole('button', { name: new RegExp(t.cover.remove) })).toBeNull();
  });

  it('renders a Remove button when hasCustom and DELETEs the cover on click', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<CoverUploader vnId="v90001" hasCustom />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.cover.remove) }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/collection/v90001/cover');
    expect(init.method).toBe('DELETE');
  });

  it('uploads the chosen file via POST FormData', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { container } = renderWithProviders(<CoverUploader vnId="v90001" hasCustom={false} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pickFile()] } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/collection/v90001/cover');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('renders the inline variant and surfaces the error alert when upload fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'upload boom' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    const { container } = renderWithProviders(<CoverUploader vnId="v90001" hasCustom={false} variant="inline" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pickFile()] } });
    // The inline error is a local <p role="alert"> rendered inside the
    // component container; the toast renders a second alert in a portal.
    await waitFor(() => expect(container.querySelector('p[role="alert"]')).not.toBeNull());
    expect(container.querySelector('p[role="alert"]')!.textContent).toContain('upload boom');
  });
});
