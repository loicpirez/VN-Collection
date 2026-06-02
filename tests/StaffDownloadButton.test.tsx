// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { StaffDownloadButton } from '@/components/StaffDownloadButton';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function okJson(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

const GOOD_BODY = { ok: true, productionCount: 4, vaCount: 3, fetched_at: 1_700_000_000 };

describe('StaffDownloadButton', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(okJson(GOOD_BODY));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the download action label with the cloud icon', () => {
    const { container } = renderWithProviders(<StaffDownloadButton sid="s90001" />, { locale: 'en' });
    expect(screen.getByRole('button')).not.toBeNull();
    expect(container.querySelector('.lucide-cloud-download')).not.toBeNull();
  });

  it('POSTs to the staff download endpoint and toasts the summed credit count', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { user } = renderWithProviders(<StaffDownloadButton sid="s90002" />, { locale: 'en' });
    await user.click(screen.getByRole('button'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/staff/s90002/download');
    expect(init.method).toBe('POST');
    // productionCount(4) + vaCount(3) = 7
    expect(await screen.findByText(/\(7\)/)).not.toBeNull();
  });

  it('errors when the decoder rejects the body (missing fetched_at)', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ ok: true, productionCount: 1, vaCount: 1 }));
    const { user } = renderWithProviders(<StaffDownloadButton sid="s90003" />, { locale: 'en' });
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('Error')).not.toBeNull();
  });

  it('surfaces the server error message on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ error: 'vndb 503' }, 503));
    const { user } = renderWithProviders(<StaffDownloadButton sid="s90004" />, { locale: 'en' });
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('vndb 503')).not.toBeNull();
  });

  it('shows a spinner while busy and re-enables after success', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    global.fetch = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { container, user } = renderWithProviders(<StaffDownloadButton sid="s90005" />, { locale: 'en' });
    const btn = screen.getByRole('button');
    await user.click(btn);
    await waitFor(() => expect(container.querySelector('.lucide-loader-circle')).not.toBeNull());
    // Second click is a no-op while in-flight.
    await user.click(btn);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(okJson(GOOD_BODY));
    await waitFor(() => expect(btn.hasAttribute('disabled')).toBe(false));
  });
});
