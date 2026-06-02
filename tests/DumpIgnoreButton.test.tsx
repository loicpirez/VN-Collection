// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DumpIgnoreButton } from '@/components/DumpIgnoreButton';

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

describe('DumpIgnoreButton', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ ok: true }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the Ignore label + EyeOff icon when not yet ignored', () => {
    const { container } = renderWithProviders(<DumpIgnoreButton vnId="v90001" ignored={false} />, { locale: 'en' });
    const btn = screen.getByRole('button', { name: 'Ignore' });
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('title')).toBe('Ignore');
    expect(container.querySelector('.lucide-eye-off')).not.toBeNull();
  });

  it('renders the Restore label + Eye icon when already ignored', () => {
    const { container } = renderWithProviders(<DumpIgnoreButton vnId="v90002" ignored />, { locale: 'en' });
    expect(screen.getByRole('button', { name: 'Restore' })).not.toBeNull();
    expect(container.querySelector('.lucide-eye')).not.toBeNull();
  });

  it('PATCHes dumped_ignored=true and shows the ignored toast on success', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { user } = renderWithProviders(<DumpIgnoreButton vnId="v90003" ignored={false} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Ignore' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/collection/v90003');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ dumped_ignored: true });
    expect(await screen.findByText('VN ignored in the dump tracker.')).not.toBeNull();
  });

  it('PATCHes dumped_ignored=false and shows the restored toast when already ignored', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { user } = renderWithProviders(<DumpIgnoreButton vnId="v90004" ignored />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ dumped_ignored: false });
    expect(await screen.findByText('VN restored in the dump tracker.')).not.toBeNull();
  });

  it('surfaces the server error message on a non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ error: 'patch boom' }, 500));
    const { user } = renderWithProviders(<DumpIgnoreButton vnId="v90005" ignored={false} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Ignore' }));
    expect(await screen.findByText('patch boom')).not.toBeNull();
  });

  it('surfaces a thrown network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const { user } = renderWithProviders(<DumpIgnoreButton vnId="v90006" ignored={false} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Ignore' }));
    expect(await screen.findByText('offline')).not.toBeNull();
  });

  it('ignores a second click while a request is already in flight', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    global.fetch = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { user } = renderWithProviders(<DumpIgnoreButton vnId="v90007" ignored={false} />, { locale: 'en' });
    const btn = screen.getByRole('button', { name: 'Ignore' });
    await user.click(btn);
    await waitFor(() => expect(btn.hasAttribute('disabled')).toBe(true));
    await user.click(btn);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(okJson({ ok: true }));
    await waitFor(() => expect(btn.hasAttribute('disabled')).toBe(false));
  });
});
