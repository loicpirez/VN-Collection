// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { HeroBanner } from '@/components/HeroBanner';
import { dictionaries } from '@/lib/i18n/dictionaries';

if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;

function errorResponse(msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'content-type': 'application/json' } });
}

function renderHero(ui: React.ReactElement, settings?: Record<string, unknown>) {
  if (settings) localStorage.setItem('vn_display_settings_v1', JSON.stringify(settings));
  return renderWithProviders(<DisplaySettingsProvider>{ui}</DisplaySettingsProvider>, { locale: 'en' });
}

describe('HeroBanner branches', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('renders the hide-images placeholder (no <img>) while keeping the adjust + rotate affordances', async () => {
    const { container } = renderHero(
      <HeroBanner vnId="v90020" src="https://example.com/banner.jpg" customBanner initialPosition={null} inCollection />,
      { hideImages: true },
    );
    await waitFor(() => expect(container.querySelector('img')).toBeNull());
    expect(screen.getAllByRole('button', { name: t.banner.adjust }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: t.coverActions.rotateRight }).length).toBeGreaterThan(0);
  });

  it('reveals an R18-blurred banner when the reveal overlay is clicked', async () => {
    const { container } = renderHero(
      <HeroBanner vnId="v90021" src="https://example.com/r18.jpg" customBanner initialPosition={null} inCollection={false} sexual={2} />,
      { blurR18: true, nsfwThreshold: 1, hideImages: false },
    );
    const revealBtn = await screen.findByRole('button', { name: t.settings.r18Blurred });
    fireEvent.click(revealBtn);
    await waitFor(() => expect(screen.queryByRole('button', { name: t.settings.r18Blurred })).toBeNull());
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('renders the ImageOff fallback when the banner image errors', async () => {
    const { container } = renderHero(
      <HeroBanner vnId="v90022" src="https://example.com/dead.jpg" customBanner initialPosition={null} inCollection={false} />,
    );
    const img = container.querySelector('img') as HTMLImageElement;
    fireEvent.error(img);
    await waitFor(() => expect(container.querySelector('img')).toBeNull());
  });

  it('renders the blurred contain overlay (second img) for a non-custom banner once loaded', async () => {
    const { container } = renderHero(
      <HeroBanner vnId="v90023" src="https://example.com/auto.jpg" customBanner={false} initialPosition={null} inCollection={false} />,
    );
    const img = container.querySelector('img') as HTMLImageElement;
    fireEvent.load(img);
    // A non-custom, loaded, non-editing banner paints a second contain <img> overlay.
    await waitFor(() => expect(container.querySelectorAll('img').length).toBe(2));
  });

  it('reverts the optimistic rotation and surfaces an error when the rotate PATCH fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(errorResponse('rotate boom'));
    renderHero(
      <HeroBanner vnId="v90024" src="https://example.com/banner.jpg" customBanner initialPosition={null} inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.coverActions.rotateRight })[0]);
    await waitFor(() => expect(screen.getAllByText('rotate boom').length).toBeGreaterThan(0));
  });

  it('surfaces an error when saving the focal position fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(errorResponse('save boom'));
    renderHero(
      <HeroBanner vnId="v90025" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    await screen.findByRole('application', { name: t.banner.focalPointLabel });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    await waitFor(() => expect(screen.getAllByText('save boom').length).toBeGreaterThan(0));
  });

  it('surfaces an error when resetting the focal position fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(errorResponse('reset boom'));
    renderHero(
      <HeroBanner vnId="v90026" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    await screen.findByRole('application', { name: t.banner.focalPointLabel });
    fireEvent.click(screen.getByRole('button', { name: t.banner.resetPosition }));
    await waitFor(() => expect(screen.getAllByText('reset boom').length).toBeGreaterThan(0));
  });

  it('measures the container for a persisted 90deg rotation (ResizeObserver branch)', () => {
    const { container } = renderHero(
      <HeroBanner vnId="v90027" src="https://example.com/rot.jpg" customBanner initialPosition={null} inCollection={false} initialRotation={90} />,
    );
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('style') ?? '').toContain('rotate(90deg)');
  });

  it('cancels editing back to read-only via the cancel control', async () => {
    renderHero(
      <HeroBanner vnId="v90028" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    await screen.findByRole('application', { name: t.banner.focalPointLabel });
    fireEvent.click(screen.getByRole('button', { name: t.common.cancel }));
    await waitFor(() => expect(screen.queryByRole('application', { name: t.banner.focalPointLabel })).toBeNull());
  });

  it('updates the draft focal point through a pointer drag while editing', async () => {
    renderHero(
      <HeroBanner vnId="v90029" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    const region = await screen.findByRole('application', { name: t.banner.focalPointLabel });
    region.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON() {} }) as DOMRect;
    fireEvent.pointerDown(region, { clientX: 20, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(region, { clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(region, { pointerId: 1 });
    // The draft readout reflects the dragged-to coordinates (50% 50%).
    expect(screen.getByText(/50% 50%/)).toBeInTheDocument();
  });

  it('nudges the focal point with ArrowLeft, Home and End keys', async () => {
    renderHero(
      <HeroBanner vnId="v90030" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    const region = await screen.findByRole('application', { name: t.banner.focalPointLabel });
    fireEvent.keyDown(region, { key: 'Home' });
    expect(screen.getByText(/^0% 50%$/)).toBeInTheDocument();
    fireEvent.keyDown(region, { key: 'End' });
    expect(screen.getByText(/^100% 50%$/)).toBeInTheDocument();
    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    expect(screen.getByText(/^99% 50%$/)).toBeInTheDocument();
    fireEvent.keyDown(region, { key: 'PageUp' });
    expect(screen.getByText(/^99% 25%$/)).toBeInTheDocument();
  });

  it('saves the focal position successfully and exits editing', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderHero(
      <HeroBanner vnId="v90031" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    await screen.findByRole('application', { name: t.banner.focalPointLabel });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('application', { name: t.banner.focalPointLabel })).toBeNull());
  });

  it('rotates the banner left successfully via PATCH', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderHero(
      <HeroBanner vnId="v90032" src="https://example.com/banner.jpg" customBanner initialPosition={null} inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.coverActions.rotateLeft })[0]);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(true));
    const patch = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(JSON.parse(patch[1].body)).toEqual({ rotation: 270 });
  });
});
