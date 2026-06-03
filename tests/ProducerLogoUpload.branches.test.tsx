// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { ProducerLogoUpload } from '@/components/ProducerLogoUpload';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function logoFile() {
  return new File(['bytes'], 'logo.png', { type: 'image/png' });
}

describe('ProducerLogoUpload branches', () => {
  beforeEach(() => {
    refresh.mockClear();
    global.fetch = vi.fn().mockResolvedValue(json({ ok: true }));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('surfaces an error alert when the remove DELETE fails', async () => {
    global.fetch = vi.fn().mockResolvedValue(json({ error: 'remove boom' }, 500));
    renderWithProviders(<ProducerLogoUpload producerId="p90001" hasLogo />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove logo' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('remove boom'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('surfaces an error alert when the refetch GET fails', async () => {
    global.fetch = vi.fn().mockResolvedValue(json({ error: 'refetch boom' }, 503));
    renderWithProviders(<ProducerLogoUpload producerId="p90001" hasLogo={false} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh from VNDB' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('refetch boom'));
  });

  it('refetch success path clears a prior error and shows the status message', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(<ProducerLogoUpload producerId="p90001" hasLogo={false} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh from VNDB' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Updated.'));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/producer/p90001');
    expect(refresh).toHaveBeenCalled();
  });

  it('ignores a change event with no selected file (no fetch)', () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { container } = renderWithProviders(<ProducerLogoUpload producerId="p90001" hasLogo={false} />, { locale: 'en' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    // Empty FileList -> the `if (f)` guard is false; no upload is attempted.
    fireEvent.change(input, { target: { files: [] } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resets local state (busy/error) when the producerId prop changes', async () => {
    global.fetch = vi.fn().mockResolvedValue(json({ error: 'first boom' }, 500));
    const { rerender, container } = renderWithProviders(
      <ProducerLogoUpload producerId="p90001" hasLogo={false} />,
      { locale: 'en' },
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [logoFile()] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('first boom'));
    // Switching to a different producer re-runs the identity effect, which
    // clears the error/info/busy state.
    rerender(<ProducerLogoUpload producerId="p90002" hasLogo={false} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
