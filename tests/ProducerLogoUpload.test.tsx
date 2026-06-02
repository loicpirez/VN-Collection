// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { ProducerLogoUpload } from '@/components/ProducerLogoUpload';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.fr;

function logoFile() {
  return new File(['bytes'], 'logo.png', { type: 'image/png' });
}

describe('ProducerLogoUpload', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders upload + fetch-info buttons; no remove button without a logo', () => {
    renderWithProviders(<ProducerLogoUpload producerId="p90001" hasLogo={false} />);
    expect(screen.getByRole('button', { name: new RegExp(t.producers.uploadLogo) })).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(t.producers.fetchInfo) })).toBeTruthy();
    expect(screen.queryByRole('button', { name: new RegExp(t.producers.removeLogo) })).toBeNull();
  });

  it('uploads a logo via POST FormData', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { container } = renderWithProviders(<ProducerLogoUpload producerId="p90001" hasLogo={false} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [logoFile()] } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/producer/p90001/logo');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('removes the logo via DELETE when hasLogo', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<ProducerLogoUpload producerId="p90001" hasLogo />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.producers.removeLogo) }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/producer/p90001/logo');
    expect(init.method).toBe('DELETE');
  });

  it('refetches producer info via GET and shows the success status', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<ProducerLogoUpload producerId="p90001" hasLogo={false} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.producers.fetchInfo) }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe('/api/producer/p90001');
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(t.producers.fetched));
  });

  it('shows an error alert when the upload fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'logo failed' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    const { container } = renderWithProviders(<ProducerLogoUpload producerId="p90001" hasLogo={false} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [logoFile()] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('logo failed'));
  });
});
