// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, act } from '@testing-library/react';
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
  return renderWithProviders(<DisplaySettingsProvider>{ui}</DisplaySettingsProvider>);
}

describe('CoverHero', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the cover image with the remote src and the edit overlay when in collection', () => {
    renderHero(
      <CoverHero
        vnId="v90001"
        initialRemote="https://example.com/cover.jpg"
        initialLocal={null}
        sexual={0}
        alt="Title Y cover"
        inCollection
      />,
    );
    const img = screen.getByAltText('Title Y cover') as HTMLImageElement;
    expect(img.tagName).toBe('IMG');
    // CoverEditOverlay button is present when inCollection is true.
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('omits the edit overlay when not in collection', () => {
    renderHero(
      <CoverHero
        vnId="v90001"
        initialRemote="https://example.com/cover.jpg"
        initialLocal={null}
        sexual={0}
        alt="Title Y cover"
        inCollection={false}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('repaints to the local source when a cover-changed event for this VN arrives', () => {
    renderHero(
      <CoverHero
        vnId="v90003"
        initialRemote={null}
        initialLocal={null}
        sexual={null}
        alt="Updated cover"
        inCollection={false}
      />,
    );
    // No usable source -> placeholder (role=img with the alt as aria-label).
    expect(screen.getByRole('img', { name: 'Updated cover' })).toBeTruthy();
    act(() => {
      dispatchCoverChanged({ vnId: 'v90003', newSrc: null, newLocal: 'cover/v90003.jpg' });
    });
    const img = screen.getByAltText('Updated cover') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/api/files/cover/v90003.jpg');
  });

  it('ignores cover-changed events scoped to a different VN', () => {
    renderHero(
      <CoverHero
        vnId="v90003"
        initialRemote={null}
        initialLocal={null}
        sexual={null}
        alt="Other cover"
        inCollection={false}
      />,
    );
    act(() => {
      dispatchCoverChanged({ vnId: 'v99999', newSrc: 'https://elsewhere/x.jpg', newLocal: null });
    });
    // Still the placeholder because the event targeted another VN.
    expect(screen.getByRole('img', { name: 'Other cover' })).toBeTruthy();
  });
});
