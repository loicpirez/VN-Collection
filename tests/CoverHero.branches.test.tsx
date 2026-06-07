// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, act, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { CoverHero } from '@/components/CoverHero';
import { dispatchCoverChanged } from '@/lib/cover-banner-events';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function renderHero(ui: React.ReactElement) {
  return renderWithProviders(<DisplaySettingsProvider>{ui}</DisplaySettingsProvider>, { locale: 'en' });
}

describe('CoverHero branches', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('repaints to a new remote src when a cover-changed event carries newSrc', () => {
    renderHero(
      <CoverHero vnId="v90010" initialRemote={null} initialLocal={null} sexual={null} alt="Remote cover" inCollection={false} />,
    );
    act(() => {
      dispatchCoverChanged({ vnId: 'v90010', newSrc: 'https://example.com/new-remote.jpg', newLocal: null });
    });
    const img = screen.getByAltText('Remote cover') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://example.com/new-remote.jpg');
  });

  it('clears both sources on an explicit reset event (both null) and shows the placeholder', () => {
    renderHero(
      <CoverHero vnId="v90011" initialRemote="https://example.com/old.jpg" initialLocal={null} sexual={null} alt="Reset cover" inCollection={false} />,
    );
    expect(screen.getByAltText('Reset cover').tagName).toBe('IMG');
    act(() => {
      dispatchCoverChanged({ vnId: 'v90011', newSrc: null, newLocal: null });
    });
    // No usable source anywhere → SafeImage placeholder (role=img).
    expect(screen.getByRole('img', { name: 'Reset cover' })).toBeInTheDocument();
  });

  it('applies a rotation delivered on the cover-changed event', () => {
    const { container } = renderHero(
      <CoverHero vnId="v90012" initialRemote="https://example.com/rot.jpg" initialLocal={null} sexual={null} alt="Rotated cover" inCollection={false} />,
    );
    act(() => {
      dispatchCoverChanged({ vnId: 'v90012', newSrc: 'https://example.com/rot.jpg', newLocal: null, rotation: 180 });
    });
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('style') ?? '').toContain('rotate(180deg)');
  });

  it('falls back to the local copy when the remote image fails to load', async () => {
    // Seed the persisted setting so the post-mount hydration keeps
    // remote-first ordering; the remote <img> then renders and its error
    // event drives CoverHero's remoteFailed -> local fallback branch.
    localStorage.setItem('vn_display_settings_v1', JSON.stringify({ preferLocalImages: false }));
    renderHero(
      <CoverHero
        vnId="v90013"
        initialRemote="https://example.com/dead.jpg"
        initialLocal="cover/v90013.jpg"
        sexual={null}
        alt="Fallback cover"
        inCollection={false}
      />,
    );
    const img = screen.getByAltText('Fallback cover') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://example.com/dead.jpg');
    act(() => {
      img.dispatchEvent(new Event('error'));
    });
    // After the remote fails the SafeImage resolves to the local mirror.
    await waitFor(() => {
      const next = screen.getByAltText('Fallback cover') as HTMLImageElement;
      expect(next.getAttribute('src')).toBe('/api/files/cover/v90013.jpg');
    });
  });

  it('shows the no-image placeholder when load fails without a local fallback', () => {
    localStorage.setItem('vn_display_settings_v1', JSON.stringify({ preferLocalImages: false }));
    renderHero(
      <CoverHero
        vnId="v90015"
        initialRemote="https://example.com/no-local.jpg"
        initialLocal={null}
        sexual={null}
        alt="No local cover"
        inCollection={false}
      />,
    );
    const img = screen.getByAltText('No local cover') as HTMLImageElement;
    act(() => {
      img.dispatchEvent(new Event('error'));
    });
    expect(screen.getByRole('img', { name: 'No local cover' })).toBeInTheDocument();
  });

  it('re-syncs client state to new server-rendered props on rerender', () => {
    const { rerender } = renderHero(
      <CoverHero vnId="v90014" initialRemote="https://example.com/a.jpg" initialLocal={null} sexual={null} alt="Synced cover" inCollection={false} />,
    );
    expect((screen.getByAltText('Synced cover') as HTMLImageElement).getAttribute('src')).toBe('https://example.com/a.jpg');
    rerender(
      <DisplaySettingsProvider>
        <CoverHero vnId="v90014" initialRemote="https://example.com/b.jpg" initialLocal={null} sexual={null} alt="Synced cover" inCollection={false} />
      </DisplaySettingsProvider>,
    );
    expect((screen.getByAltText('Synced cover') as HTMLImageElement).getAttribute('src')).toBe('https://example.com/b.jpg');
  });
});
