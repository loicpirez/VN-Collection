// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LazyMapVnToEgsButton } from '@/components/LazyMapVnToEgsButton';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    game: null,
    manual: null,
    source: null,
  }), { status: 200, headers: { 'content-type': 'application/json' } }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LazyMapVnToEgsButton', () => {
  it('keeps the inline trigger stable and mounts the dialog only after activation', async () => {
    renderWithProviders(
      <LazyMapVnToEgsButton vnId="v90001" seedQuery="Seed Name" keepMenuOpen />,
      { locale: 'en' },
    );
    const trigger = screen.getByRole('button', { name: dictionaries.en.mapVn.cta });
    expect(trigger).toHaveAttribute('data-menu-keep-open');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.pointerEnter(trigger);
    fireEvent.focus(trigger);
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: dictionaries.en.common.close }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('preserves the compact trigger contract without a menu marker', async () => {
    renderWithProviders(
      <LazyMapVnToEgsButton vnId="v90002" seedQuery="Compact" variant="compact" />,
      { locale: 'en' },
    );
    const trigger = screen.getByRole('button', { name: dictionaries.en.mapVn.cta });
    expect(trigger).not.toHaveAttribute('data-menu-keep-open');
    expect(trigger).toHaveClass('icon-chip');
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('keeps an explicit inline trigger class', () => {
    renderWithProviders(
      <LazyMapVnToEgsButton
        vnId="v90003"
        seedQuery="Custom"
        triggerClassName="custom-trigger"
      />,
      { locale: 'en' },
    );
    expect(screen.getByRole('button', { name: dictionaries.en.mapVn.cta })).toHaveClass(
      'custom-trigger',
    );
  });
});
