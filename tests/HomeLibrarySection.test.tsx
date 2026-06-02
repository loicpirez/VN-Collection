// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/**
 * Stub the heavy LibraryClient tree (2k-line, fetch-driven) with a probe
 * that records the render mode. This isolates the section's
 * visibility / collapse branches.
 */
vi.mock('@/components/LibraryClient', () => ({
  LibraryClient: ({ mode }: { mode?: string }) => <div data-testid="library-client" data-mode={mode} />,
}));

import { HomeLibraryControlsSection, HomeLibraryGridSection } from '@/components/HomeLibrarySection';

afterEach(() => {
  cleanup();
});

describe('HomeLibraryControlsSection', () => {
  it('renders the heading and the controls-only LibraryClient when visible and expanded', () => {
    renderWithProviders(
      <HomeLibraryControlsSection initialState={{ visible: true, collapsed: false }} />,
      { locale: 'en' },
    );
    expect(screen.getByRole('heading', { name: 'The library' })).toBeInTheDocument();
    const client = screen.getByTestId('library-client');
    expect(client).toHaveAttribute('data-mode', 'controls-only');
  });

  it('keeps the heading but hides the LibraryClient body when collapsed', () => {
    renderWithProviders(
      <HomeLibraryControlsSection initialState={{ visible: true, collapsed: true }} />,
      { locale: 'en' },
    );
    expect(screen.getByRole('heading', { name: 'The library' })).toBeInTheDocument();
    expect(screen.queryByTestId('library-client')).not.toBeInTheDocument();
  });

  it('renders nothing when the section is hidden', () => {
    const { container } = renderWithProviders(
      <HomeLibraryControlsSection initialState={{ visible: false, collapsed: false }} />,
      { locale: 'en' },
    );
    expect(container.querySelector('section')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'The library' })).not.toBeInTheDocument();
  });

  it('exposes the collapse and section-options controls', () => {
    renderWithProviders(
      <HomeLibraryControlsSection initialState={{ visible: true, collapsed: false }} />,
      { locale: 'en' },
    );
    expect(screen.getByRole('button', { name: /Collapse - Library \/ filters & sort/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Section options - Library \/ filters & sort/ })).toBeInTheDocument();
  });
});

describe('HomeLibraryGridSection', () => {
  it('renders the grid-only LibraryClient under a labelled section when expanded', () => {
    renderWithProviders(
      <HomeLibraryGridSection initialState={{ visible: true, collapsed: false }} />,
      { locale: 'en' },
    );
    expect(screen.getByRole('region', { name: 'Library / grid' })).toBeInTheDocument();
    expect(screen.getByTestId('library-client')).toHaveAttribute('data-mode', 'grid-only');
  });

  it('hides the grid body when collapsed but keeps the controls', () => {
    renderWithProviders(
      <HomeLibraryGridSection initialState={{ visible: true, collapsed: true }} />,
      { locale: 'en' },
    );
    expect(screen.getByRole('region', { name: 'Library / grid' })).toBeInTheDocument();
    expect(screen.queryByTestId('library-client')).not.toBeInTheDocument();
  });

  it('renders nothing when hidden', () => {
    const { container } = renderWithProviders(
      <HomeLibraryGridSection initialState={{ visible: false, collapsed: false }} />,
      { locale: 'en' },
    );
    expect(container.querySelector('section')).toBeNull();
  });
});
