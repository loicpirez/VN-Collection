// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { PageSpaceFrame, HeaderSpaceFrame } from '@/components/PageSpaceFrame';
import { DisplaySettingsProvider } from '@/lib/settings/client';

let pathnameValue = '/';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => pathnameValue,
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/** Persist display settings the provider rehydrates from after mount. */
function seedSettings(payload: Record<string, unknown>) {
  localStorage.setItem('vn_display_settings_v1', JSON.stringify(payload));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  pathnameValue = '/';
});

describe('PageSpaceFrame', () => {
  it('resolves the library scope on the root path with its default preset', () => {
    pathnameValue = '/';
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <PageSpaceFrame>
          <span>page-body</span>
        </PageSpaceFrame>
      </DisplaySettingsProvider>,
    );
    expect(screen.getByText('page-body')).toBeInTheDocument();
    const frame = container.querySelector('.page-space-frame') as HTMLElement;
    expect(frame.getAttribute('data-page-space-scope')).toBe('library');
    expect(frame.getAttribute('data-page-space-preset')).toBe('standard');
    expect(frame.style.getPropertyValue('--page-space-max-width')).toBe('80rem');
  });

  it('uses the vn scope default (wide) on a /vn detail path', () => {
    pathnameValue = '/vn/v90001';
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <PageSpaceFrame>x</PageSpaceFrame>
      </DisplaySettingsProvider>,
    );
    const frame = container.querySelector('.page-space-frame') as HTMLElement;
    expect(frame.getAttribute('data-page-space-scope')).toBe('vn');
    expect(frame.getAttribute('data-page-space-preset')).toBe('wide');
  });

  it('applies a per-scope override when present', () => {
    pathnameValue = '/';
    seedSettings({ pageSpace: { library: 'compact' } });
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <PageSpaceFrame className="extra">x</PageSpaceFrame>
      </DisplaySettingsProvider>,
    );
    const frame = container.querySelector('.page-space-frame') as HTMLElement;
    expect(frame).toHaveClass('extra');
    expect(frame.getAttribute('data-page-space-preset')).toBe('compact');
  });

  it('lets a global page-space override win over the scope default', () => {
    pathnameValue = '/vn/v90001';
    seedSettings({ globalPageSpace: 'canvas' });
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <PageSpaceFrame>x</PageSpaceFrame>
      </DisplaySettingsProvider>,
    );
    const frame = container.querySelector('.page-space-frame') as HTMLElement;
    expect(frame.getAttribute('data-page-space-preset')).toBe('canvas');
  });
});

describe('HeaderSpaceFrame', () => {
  it('uses the navbar scope and standard preset when header does not follow the page', () => {
    pathnameValue = '/vn/v90001';
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <HeaderSpaceFrame className="nav-frame">
          <span>nav-body</span>
        </HeaderSpaceFrame>
      </DisplaySettingsProvider>,
    );
    expect(screen.getByText('nav-body')).toBeInTheDocument();
    const frame = container.querySelector('.page-space-frame') as HTMLElement;
    expect(frame).toHaveClass('nav-frame');
    expect(frame.getAttribute('data-page-space-scope')).toBe('navbar');
    expect(frame.getAttribute('data-page-space-preset')).toBe('standard');
  });

  it('follows the active page scope when headerFollowsPageSpace is enabled', () => {
    pathnameValue = '/vn/v90001';
    seedSettings({ headerFollowsPageSpace: true });
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <HeaderSpaceFrame>x</HeaderSpaceFrame>
      </DisplaySettingsProvider>,
    );
    const frame = container.querySelector('.page-space-frame') as HTMLElement;
    expect(frame.getAttribute('data-page-space-scope')).toBe('vn');
    expect(frame.getAttribute('data-page-space-preset')).toBe('wide');
  });
});
