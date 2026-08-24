// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { PageSpaceFrame, HeaderSpaceFrame } from '@/components/PageSpaceFrame';
import { DensityScopeProvider } from '@/components/DensityScopeProvider';
import { DisplaySettingsProvider, useDisplaySettings } from '@/lib/settings/client';

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

function LiveLayoutControls() {
  const { settings, set } = useDisplaySettings();
  return (
    <>
      <button type="button" onClick={() => set('pageSpace', { ...settings.pageSpace, library: 'compact' })}>
        set-live-width
      </button>
      <button type="button" onClick={() => set('density', { ...settings.density, library: 320 })}>
        set-live-density
      </button>
    </>
  );
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

  it('updates the open page width and density immediately through the shared settings source', async () => {
    pathnameValue = '/';
    const { container } = renderWithProviders(
      <DisplaySettingsProvider>
        <LiveLayoutControls />
        <PageSpaceFrame>
          <DensityScopeProvider scope="library" className="live-density-frame">
            page-body
          </DensityScopeProvider>
        </PageSpaceFrame>
      </DisplaySettingsProvider>,
    );
    const frame = container.querySelector('.page-space-frame') as HTMLElement;
    const densityFrame = container.querySelector('.live-density-frame') as HTMLElement;
    await waitFor(() => expect(frame.getAttribute('data-page-space-preset')).toBe('standard'));
    expect(densityFrame.style.getPropertyValue('--card-density-px')).toBe('220px');

    fireEvent.click(screen.getByRole('button', { name: 'set-live-width' }));
    fireEvent.click(screen.getByRole('button', { name: 'set-live-density' }));

    await waitFor(() => expect(frame.getAttribute('data-page-space-preset')).toBe('compact'));
    expect(frame.style.getPropertyValue('--page-space-max-width')).toBe('56rem');
    expect(densityFrame.style.getPropertyValue('--card-density-px')).toBe('320px');
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
