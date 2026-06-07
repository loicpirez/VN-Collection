// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { HeroBanner } from '@/components/HeroBanner';
import { dispatchBannerChanged, VN_BANNER_CHANGED_EVENT } from '@/lib/cover-banner-events';
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
    vi.unstubAllGlobals();
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
    fireEvent.click(screen.getAllByRole('button', { name: t.coverActions.rotateLeft })[0]);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getAllByRole('button', { name: t.coverActions.rotateRight })[0]);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
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

  it('applies the loaded R18 blur image class before reveal', async () => {
    const { container } = renderHero(
      <HeroBanner vnId="v90047" src="https://example.com/r18.jpg" customBanner initialPosition={null} inCollection={false} sexual={2} />,
      { blurR18: true, nsfwThreshold: 1, hideImages: false },
    );
    const img = container.querySelector('img') as HTMLImageElement;
    fireEvent.load(img);
    await waitFor(() => expect(img.className).toContain('blur-2xl'));
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

  it('uses ResizeObserver when available and disconnects it on unmount', () => {
    const disconnect = vi.fn();
    const observe = vi.fn((element: Element) => {
      resizeCallback([{ contentRect: { width: 320, height: 180 } } as ResizeObserverEntry], {} as ResizeObserver);
      expect(element).toBeInstanceOf(HTMLElement);
    });
    let resizeCallback: ResizeObserverCallback = () => undefined;
    class MockResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
      observe = observe;
      disconnect = disconnect;
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    const { unmount } = renderHero(
      <HeroBanner vnId="v90033" src="https://example.com/rot.jpg" customBanner initialPosition={null} inCollection={false} initialRotation={90} />,
    );
    expect(observe).toHaveBeenCalledTimes(1);
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('marks the banner loaded on mount when the image is already complete', async () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(640);
    const { container } = renderHero(
      <HeroBanner vnId="v90034" src="https://example.com/loaded.jpg" customBanner initialPosition={null} inCollection />,
    );
    await waitFor(() => expect(container.querySelector('[data-hero-banner-skeleton]')).toBeNull());
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

  it('clamps invalid pointer math back to the center while editing', async () => {
    renderHero(
      <HeroBanner vnId="v90048" src="https://example.com/banner.jpg" customBanner initialPosition="10% 20%" inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    const region = await screen.findByRole('application', { name: t.banner.focalPointLabel });
    region.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect;
    fireEvent.pointerDown(region, { clientX: 0, clientY: 0, pointerId: 1 });
    expect(screen.getByText(/^50% 50%$/)).toBeInTheDocument();
  });

  it('ignores pointer and keyboard adjustment events outside edit mode', () => {
    const { container } = renderHero(
      <HeroBanner vnId="v90035" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />,
    );
    const region = container.firstElementChild as HTMLElement;
    fireEvent.pointerDown(region, { clientX: 20, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(region, { clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(region, { pointerId: 1 });
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(screen.queryByText(/^51% 50%$/)).toBeNull();
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
    fireEvent.keyDown(region, { key: 'ArrowUp' });
    expect(screen.getByText(/^99% 24%$/)).toBeInTheDocument();
    fireEvent.keyDown(region, { key: 'PageDown' });
    expect(screen.getByText(/^99% 49%$/)).toBeInTheDocument();
    fireEvent.keyDown(region, { key: 'Tab' });
    expect(screen.getByText(/^99% 49%$/)).toBeInTheDocument();
  });

  it('falls back invalid focal coordinates while editing', async () => {
    renderHero(
      <HeroBanner vnId="v90036" src="https://example.com/banner.jpg" customBanner initialPosition="bad nope" inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    const region = await screen.findByRole('application', { name: t.banner.focalPointLabel });
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(screen.getByText(/^51% 50%$/)).toBeInTheDocument();
  });

  it('uses the loaded editing image class while adjusting the focal point', async () => {
    const { container } = renderHero(
      <HeroBanner vnId="v90049" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />,
    );
    const img = container.querySelector('img') as HTMLImageElement;
    fireEvent.load(img);
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    await screen.findByRole('application', { name: t.banner.focalPointLabel });
    expect(img.className).not.toContain('opacity-0');
    expect(img.className).not.toContain('blur-xl');
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

  it('suppresses duplicate rotation mutations while one is in flight', async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    renderHero(
      <HeroBanner vnId="v90037" src="https://example.com/banner.jpg" customBanner initialPosition={null} inCollection />,
    );
    const rotate = screen.getAllByRole('button', { name: t.coverActions.rotateRight })[0];
    act(() => {
      fireEvent.click(rotate);
      fireEvent.click(rotate);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFetch(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    });
  });

  it('suppresses duplicate save and reset mutations before disabled controls render', async () => {
    let resolveSave: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveSave = resolve;
    }));
    global.fetch = fetchMock;
    renderHero(
      <HeroBanner vnId="v90050" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    await screen.findByRole('application', { name: t.banner.focalPointLabel });
    const saveButton = screen.getByRole('button', { name: t.common.save });
    act(() => {
      fireEvent.click(saveButton);
      fireEvent.click(saveButton);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveSave(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    });

    let resolveReset: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => {
      resolveReset = resolve;
    }));
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    await screen.findByRole('application', { name: t.banner.focalPointLabel });
    const resetButton = screen.getByRole('button', { name: t.banner.resetPosition });
    act(() => {
      fireEvent.click(resetButton);
      fireEvent.click(resetButton);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolveReset(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    });
  });

  it('ignores stale successful and failed rotations after the VN identity changes', async () => {
    let resolveSuccess: (response: Response) => void = () => undefined;
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveSuccess = resolve;
    }));
    const first = renderHero(
      <HeroBanner vnId="v90038" src="https://example.com/banner.jpg" customBanner initialPosition={null} inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.coverActions.rotateRight })[0]);
    first.rerender(
      <DisplaySettingsProvider>
        <HeroBanner vnId="v90039" src="https://example.com/banner.jpg" customBanner initialPosition={null} inCollection />
      </DisplaySettingsProvider>,
    );
    await act(async () => {
      resolveSuccess(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    });
    expect(screen.queryByText(t.common.error)).toBeNull();

    let resolveFailure: (response: Response) => void = () => undefined;
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFailure = resolve;
    }));
    fireEvent.click(screen.getAllByRole('button', { name: t.coverActions.rotateRight })[0]);
    first.rerender(
      <DisplaySettingsProvider>
        <HeroBanner vnId="v90040" src="https://example.com/banner.jpg" customBanner initialPosition={null} inCollection />
      </DisplaySettingsProvider>,
    );
    await act(async () => {
      resolveFailure(errorResponse('late rotate boom'));
    });
    expect(screen.queryByText('late rotate boom')).toBeNull();
  });

  it('ignores stale save and reset completions after the VN identity changes', async () => {
    let resolveSave: (response: Response) => void = () => undefined;
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveSave = resolve;
    }));
    const view = renderHero(
      <HeroBanner vnId="v90041" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    await screen.findByRole('application', { name: t.banner.focalPointLabel });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    view.rerender(
      <DisplaySettingsProvider>
        <HeroBanner vnId="v90042" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />
      </DisplaySettingsProvider>,
    );
    await act(async () => {
      resolveSave(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    });

    let resolveReset: (response: Response) => void = () => undefined;
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveReset = resolve;
    }));
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    await screen.findByRole('application', { name: t.banner.focalPointLabel });
    fireEvent.click(screen.getByRole('button', { name: t.banner.resetPosition }));
    view.rerender(
      <DisplaySettingsProvider>
        <HeroBanner vnId="v90043" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />
      </DisplaySettingsProvider>,
    );
    await act(async () => {
      resolveReset(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    });
  });

  it('ignores stale failed save and reset completions after the VN identity changes', async () => {
    let resolveSave: (response: Response) => void = () => undefined;
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveSave = resolve;
    }));
    const view = renderHero(
      <HeroBanner vnId="v90051" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    await screen.findByRole('application', { name: t.banner.focalPointLabel });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    view.rerender(
      <DisplaySettingsProvider>
        <HeroBanner vnId="v90052" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />
      </DisplaySettingsProvider>,
    );
    await act(async () => {
      resolveSave(errorResponse('late save boom'));
    });
    expect(screen.queryByText('late save boom')).toBeNull();

    let resolveReset: (response: Response) => void = () => undefined;
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveReset = resolve;
    }));
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    await screen.findByRole('application', { name: t.banner.focalPointLabel });
    fireEvent.click(screen.getByRole('button', { name: t.banner.resetPosition }));
    view.rerender(
      <DisplaySettingsProvider>
        <HeroBanner vnId="v90053" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />
      </DisplaySettingsProvider>,
    );
    await act(async () => {
      resolveReset(errorResponse('late reset boom'));
    });
    expect(screen.queryByText('late reset boom')).toBeNull();
  });

  it('shows the not-in-collection edit message if collection state changes while editing', async () => {
    const view = renderHero(
      <HeroBanner vnId="v90054" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    await screen.findByRole('application', { name: t.banner.focalPointLabel });
    view.rerender(
      <DisplaySettingsProvider>
        <HeroBanner vnId="v90054" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection={false} />
      </DisplaySettingsProvider>,
    );
    expect(screen.getByText(t.form.notInCollection)).toBeInTheDocument();
  });

  it('updates from banner changed events with remote source, rotation and position variants', async () => {
    const { container } = renderHero(
      <HeroBanner vnId="v90044" src="https://example.com/initial.jpg" customBanner initialPosition="50% 50%" inCollection />,
    );
    act(() => {
      window.dispatchEvent(new CustomEvent(VN_BANNER_CHANGED_EVENT));
      dispatchBannerChanged({ vnId: 'v99999', newSrc: 'https://example.com/wrong.jpg', newLocal: null });
      dispatchBannerChanged({ vnId: 'v90044', newSrc: 'https://example.com/remote.jpg', newLocal: null, rotation: 90, position: '25% 75%' });
    });
    await waitFor(() => expect((container.querySelector('img') as HTMLImageElement).getAttribute('src')).toBe('https://example.com/remote.jpg'));
    expect((container.querySelector('img') as HTMLImageElement).getAttribute('style') ?? '').toContain('25% 75%');
    act(() => {
      dispatchBannerChanged({ vnId: 'v90044', newSrc: null, newLocal: null, position: null });
    });
    await waitFor(() => expect(container.querySelector('img')).toBeNull());
  });

  it('stops propagation from hide-image and visible overlay controls', async () => {
    const outerPointer = vi.fn();
    const outerClick = vi.fn();
    const hidden = renderHero(
      <div onPointerDown={outerPointer} onClick={outerClick}>
        <HeroBanner vnId="v90045" src="https://example.com/banner.jpg" customBanner initialPosition={null} inCollection />
      </div>,
      { hideImages: true },
    );
    const hideControls = hidden.container.querySelector('.absolute.left-3') as HTMLElement;
    fireEvent.pointerDown(hideControls);
    fireEvent.click(hideControls);
    expect(outerPointer).not.toHaveBeenCalled();
    expect(outerClick).not.toHaveBeenCalled();

    hidden.unmount();
    outerPointer.mockReset();
    outerClick.mockReset();
    localStorage.clear();
    const visible = renderHero(
      <div onPointerDown={outerPointer} onPointerMove={outerPointer} onPointerUp={outerPointer} onClick={outerClick}>
        <HeroBanner vnId="v90045" src="https://example.com/banner.jpg" customBanner initialPosition={null} inCollection />
      </div>,
    );
    const visibleControls = visible.container.querySelector('.absolute.left-3') as HTMLElement;
    fireEvent.pointerDown(visibleControls);
    fireEvent.pointerMove(visibleControls);
    fireEvent.pointerUp(visibleControls);
    fireEvent.click(visibleControls);
    expect(outerPointer).not.toHaveBeenCalled();
    expect(outerClick).not.toHaveBeenCalled();
  });

  it('offers rotate controls while editing', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderHero(
      <HeroBanner vnId="v90046" src="https://example.com/banner.jpg" customBanner initialPosition="50% 50%" inCollection />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: t.banner.adjust })[0]);
    await screen.findByRole('application', { name: t.banner.focalPointLabel });
    fireEvent.click(screen.getAllByRole('button', { name: t.coverActions.rotateLeft })[0]);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => JSON.parse(c[1].body).rotation === 270)).toBe(true));
    fireEvent.click(screen.getAllByRole('button', { name: t.coverActions.rotateRight })[0]);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => JSON.parse(c[1].body).rotation === 0)).toBe(true));
  });
});
