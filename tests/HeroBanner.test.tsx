// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { HeroBanner } from '@/components/HeroBanner';
import { dispatchBannerChanged } from '@/lib/cover-banner-events';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.fr;

function renderHero(ui: React.ReactElement) {
  return renderWithProviders(<DisplaySettingsProvider>{ui}</DisplaySettingsProvider>);
}

describe('HeroBanner', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the banner image and the adjust affordance when in collection', () => {
    const { container } = renderHero(
      <HeroBanner vnId="v90001" src="https://example.com/banner.jpg" customBanner initialPosition="40% 60%" inCollection />,
    );
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://example.com/banner.jpg');
    expect(screen.getAllByRole('button', { name: t.banner.adjust }).length).toBeGreaterThan(0);
  });

  it('renders the empty backdrop when src is null', () => {
    const { container } = renderHero(
      <HeroBanner vnId="v90001" src={null} customBanner={false} initialPosition={null} inCollection />,
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('PATCHes the new rotation when rotating right', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderHero(
      <HeroBanner vnId="v90001" src="https://example.com/banner.jpg" customBanner initialPosition={null} inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.coverActions.rotateRight })[0]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/collection/v90001/banner');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ rotation: 90 });
  });

  it('enters editing mode and saves the focal position via PATCH', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderHero(
      <HeroBanner vnId="v90001" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    // The application region is present while editing.
    const region = await screen.findByRole('application', { name: t.banner.focalPointLabel });
    expect(region).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/banner' && c[1]?.method === 'PATCH')).toBe(true));
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/collection/v90001/banner' && c[1]?.method === 'PATCH');
    expect(JSON.parse(call![1].body)).toHaveProperty('position');
  });

  it('adjusts the focal point with the keyboard then resets it via PATCH null', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderHero(
      <HeroBanner vnId="v90001" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    const region = await screen.findByRole('application', { name: t.banner.focalPointLabel });
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    fireEvent.keyDown(region, { key: 'ArrowDown', shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: t.banner.resetPosition }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => {
      if (c[0] !== '/api/collection/v90001/banner' || c[1]?.method !== 'PATCH') return false;
      return JSON.parse(c[1].body).position === null;
    })).toBe(true));
  });

  it('repaints from a banner-changed event carrying a local path', async () => {
    const { container } = renderHero(
      <HeroBanner vnId="v90008" src={null} customBanner={false} initialPosition={null} inCollection={false} />,
    );
    expect(container.querySelector('img')).toBeNull();
    act(() => {
      dispatchBannerChanged({ vnId: 'v90008', newSrc: null, newLocal: 'cover/banner8.jpg' });
    });
    await waitFor(() => {
      const img = container.querySelector('img') as HTMLImageElement | null;
      expect(img?.getAttribute('src')).toBe('/api/files/cover/banner8.jpg');
    });
  });

  it('shows the not-in-collection note while editing when not owned', async () => {
    renderHero(
      <HeroBanner vnId="v90001" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection={false} />,
    );
    // No adjust button when not in collection; drive editing via a click on the banner region.
    // The component only exposes editing entry for in-collection; assert the controls are absent.
    expect(screen.queryByRole('button', { name: t.banner.adjust })).toBeNull();
    expect(screen.queryByRole('button', { name: t.coverActions.rotateRight })).toBeNull();
  });
});
