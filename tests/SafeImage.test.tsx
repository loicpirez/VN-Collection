// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SafeImage } from '@/components/SafeImage';
import { I18nProvider } from '@/lib/i18n/client';
import { dictionaries } from '@/lib/i18n/dictionaries';

const settingsState = vi.hoisted(() => ({
  current: {
    hideImages: false,
    blurR18: true,
    nsfwThreshold: 1.5,
    preferLocalImages: true,
  },
}));

vi.mock('@/lib/settings/client', () => ({
  isExplicit: (sexual: number | null | undefined, threshold: number) => sexual != null && sexual >= threshold,
  useDisplaySettings: () => ({ settings: settingsState.current }),
}));

let intersectionTarget: Element | null = null;
let intersectionCallback: IntersectionObserverCallback | null = null;
let intersectionObserver: MockIntersectionObserver | null = null;
let resizeTarget: Element | null = null;
let resizeCallback: ResizeObserverCallback | null = null;
let resizeObserver: MockResizeObserver | null = null;

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '500px 0px';
  readonly thresholds = [0.01];
  observe = vi.fn<(target: Element) => void>((target) => {
    intersectionTarget = target;
  });
  unobserve = vi.fn<(target: Element) => void>();
  disconnect = vi.fn<() => void>();
  takeRecords = (): IntersectionObserverEntry[] => [];

  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
    intersectionObserver = this;
  }
}

class MockResizeObserver implements ResizeObserver {
  observe = vi.fn<(target: Element) => void>((target) => {
    resizeTarget = target;
  });
  unobserve = vi.fn<(target: Element) => void>();
  disconnect = vi.fn<() => void>();

  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback;
    resizeObserver = this;
  }
}

function triggerIntersection(isIntersecting: boolean): void {
  const target = intersectionTarget!;
  const observer = intersectionObserver!;
  const rect = new DOMRectReadOnly();
  act(() => {
    intersectionCallback!([
      {
        boundingClientRect: rect,
        intersectionRatio: isIntersecting ? 1 : 0,
        intersectionRect: rect,
        isIntersecting,
        rootBounds: null,
        target,
        time: 0,
      },
    ], observer);
  });
}

function triggerResize(width: number, height: number): void {
  const target = resizeTarget!;
  act(() => {
    resizeCallback!([
      {
        borderBoxSize: [],
        contentBoxSize: [],
        contentRect: new DOMRectReadOnly(0, 0, width, height),
        devicePixelContentBoxSize: [],
        target,
      },
    ], resizeObserver!);
  });
}

function withLocale(ui: React.ReactNode) {
  return (
    <I18nProvider locale="en" dict={dictionaries.en}>
      {ui}
    </I18nProvider>
  );
}

beforeEach(() => {
  settingsState.current = {
    hideImages: false,
    blurR18: true,
    nsfwThreshold: 1.5,
    preferLocalImages: true,
  };
  intersectionTarget = null;
  intersectionCallback = null;
  intersectionObserver = null;
  resizeTarget = null;
  resizeCallback = null;
  resizeObserver = null;
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SafeImage runtime', () => {
  it('renders policy and missing-source placeholders without requesting an image', () => {
    settingsState.current.hideImages = true;
    const { rerender } = render(withLocale(<SafeImage src="/remote.jpg" alt="Hidden cover" />));
    expect(screen.getByRole('img', { name: 'Hidden cover' })).toHaveTextContent(dictionaries.en.settings.hiddenImage);
    expect(screen.queryByRole('img', { name: 'Hidden cover', hidden: true })).toBeInTheDocument();

    settingsState.current.hideImages = false;
    rerender(withLocale(<SafeImage alt="Missing cover" rotation={90} />));
    expect(screen.getByRole('img', { name: 'Missing cover' })).toHaveTextContent(dictionaries.en.common.noImage);
  });

  it('loads local-first priority images, resets recycled URLs, and reuses loaded URLs', () => {
    const { container, rerender } = render(withLocale(
      <SafeImage src="/remote-a.jpg" localSrc="vn/local-a.jpg" alt="Cover" priority />,
    ));
    let image = screen.getByRole('img', { name: 'Cover' });
    expect(image).toHaveAttribute('src', '/api/files/vn/local-a.jpg');
    expect(image).toHaveAttribute('loading', 'eager');
    expect(container.querySelector('[data-safe-image-skeleton]')).toBeInTheDocument();
    fireEvent.load(image);
    expect(container.querySelector('[data-safe-image-skeleton]')).toBeNull();

    rerender(withLocale(<SafeImage src="/remote-b.jpg" alt="Cover" priority />));
    image = screen.getByRole('img', { name: 'Cover' });
    expect(image).toHaveAttribute('src', '/remote-b.jpg');
    expect(container.querySelector('[data-safe-image-skeleton]')).toBeInTheDocument();

    rerender(withLocale(<SafeImage src="/api/files/vn/local-a.jpg" alt="Cover" priority />));
    image = screen.getByRole('img', { name: 'Cover' });
    expect(container.querySelector('[data-safe-image-skeleton]')).toBeNull();
    expect(image).not.toHaveClass('transition-[filter,opacity,transform]');
  });

  it('waits for intersection, ignores non-intersections, and surfaces load errors', () => {
    const onLoadError = vi.fn<() => void>();
    const { container } = render(withLocale(<SafeImage src="/lazy.jpg" alt="Lazy cover" onLoadError={onLoadError} />));
    expect(container.querySelector('img')).toBeNull();
    expect(intersectionObserver?.observe).toHaveBeenCalled();

    triggerIntersection(false);
    expect(container.querySelector('img')).toBeNull();
    triggerIntersection(true);
    const image = screen.getByRole('img', { name: 'Lazy cover' });
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(intersectionObserver?.disconnect).toHaveBeenCalled();

    fireEvent.error(image);
    expect(onLoadError).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img', { name: 'Lazy cover' })).toHaveTextContent(dictionaries.en.common.noImage);
  });

  it('loads without IntersectionObserver and falls back from a missing remote source to local storage', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    settingsState.current.preferLocalImages = false;
    const { rerender } = render(withLocale(<SafeImage localSrc="vn/fallback.jpg" alt="Fallback cover" />));
    expect(screen.getByRole('img', { name: 'Fallback cover' })).toHaveAttribute('src', '/api/files/vn/fallback.jpg');
    rerender(withLocale(<SafeImage alt="No fallback" />));
    expect(screen.getByRole('img', { name: 'No fallback' })).toHaveTextContent(dictionaries.en.common.noImage);
  });

  it('reveals blurred explicit images without bubbling the click', () => {
    const parentClick = vi.fn<() => void>();
    const { container } = render(withLocale(
      <div onClick={parentClick}>
        <SafeImage src="/explicit.jpg" alt="Explicit cover" sexual={2} fit="contain" />
      </div>,
    ));
    expect(container.querySelector('[data-safe-image-skeleton]')).toHaveClass('blur-2xl');
    triggerIntersection(true);
    expect(screen.getByRole('img', { name: 'Explicit cover' })).toHaveClass('object-contain', 'blur-2xl');
    fireEvent.click(screen.getByRole('button', { name: dictionaries.en.settings.r18Blurred }));
    expect(parentClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: dictionaries.en.settings.r18Blurred })).toBeNull();
  });

  it('measures rotation without ResizeObserver support', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 200));
    render(withLocale(<SafeImage src="/rotated.jpg" alt="Rotated cover" rotation={90} priority />));
    expect(screen.getByRole('img', { name: 'Rotated cover' })).toHaveStyle({
      transform: 'rotate(90deg) scale(2)',
    });
  });

  it('tracks ResizeObserver measurements and disconnects when rotation deactivates', () => {
    const { rerender } = render(withLocale(
      <SafeImage src="/rotated.jpg" alt="Observed rotation" rotation={270} priority />,
    ));
    expect(resizeObserver?.observe).toHaveBeenCalled();
    triggerResize(200, 100);
    expect(screen.getByRole('img', { name: 'Observed rotation' })).toHaveStyle({
      transform: 'rotate(270deg) scale(2)',
    });

    rerender(withLocale(<SafeImage src="/rotated.jpg" alt="Observed rotation" rotation={0} priority />));
    expect(resizeObserver?.disconnect).toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Observed rotation' }).style.transform).toBe('');
  });
});
