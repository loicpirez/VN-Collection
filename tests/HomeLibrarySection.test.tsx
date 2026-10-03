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

vi.mock('@/components/LibraryClient', () => ({
  LibraryClient: ({ mode }: { mode?: string }) => <div data-testid="library-client" data-mode={mode} />,
}));

import { HomeLibrarySection } from '@/components/HomeLibrarySection';

afterEach(() => {
  cleanup();
});

describe('HomeLibrarySection', () => {
  it('renders one heading and the complete LibraryClient when visible and expanded', () => {
    renderWithProviders(
      <HomeLibrarySection initialState={{ visible: true, collapsed: false }} />,
      { locale: 'en' },
    );
    expect(screen.getByRole('heading', { name: 'The library' })).toBeInTheDocument();
    const client = screen.getByTestId('library-client');
    expect(client).not.toHaveAttribute('data-mode');
  });

  it('keeps the heading but hides the LibraryClient body when collapsed', () => {
    renderWithProviders(
      <HomeLibrarySection initialState={{ visible: true, collapsed: true }} />,
      { locale: 'en' },
    );
    expect(screen.getByRole('heading', { name: 'The library' })).toBeInTheDocument();
    expect(screen.queryByTestId('library-client')).not.toBeInTheDocument();
  });

  it('renders nothing when the section is hidden', () => {
    const { container } = renderWithProviders(
      <HomeLibrarySection initialState={{ visible: false, collapsed: false }} />,
      { locale: 'en' },
    );
    expect(container.querySelector('section')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'The library' })).not.toBeInTheDocument();
  });

  it('exposes the collapse and section-options controls', () => {
    renderWithProviders(
      <HomeLibrarySection initialState={{ visible: true, collapsed: false }} />,
      { locale: 'en' },
    );
    expect(screen.getByRole('button', { name: /Collapse - Library/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Section options - Library/ })).toBeInTheDocument();
  });
});
