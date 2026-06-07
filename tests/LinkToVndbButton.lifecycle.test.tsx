// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { dictionaries } from '@/lib/i18n/dictionaries';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  debouncedCallbacks: [] as Array<(query: string) => void>,
}));

vi.mock('@/lib/hooks', () => ({
  useDebouncedCallback: (fn: (query: string) => void) => {
    mocks.debouncedCallbacks.push(fn);
    return () => {};
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace, refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

import { LinkToVndbButton } from '@/components/LinkToVndbButton';

const t = dictionaries.en;

describe('LinkToVndbButton lifecycle guards', () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.debouncedCallbacks.length = 0;
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { headers: { 'content-type': 'application/json' } }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('ignores a stale debounced search callback after the component identity changes', async () => {
    const view = renderWithProviders(
      <LinkToVndbButton vnId="egs_5" seedQuery="Title Y" />,
      { locale: 'en' },
    );
    const staleSearch = mocks.debouncedCallbacks[0]!;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.linkVndb.cta) }));
    await screen.findByRole('dialog');
    vi.mocked(global.fetch).mockClear();
    view.rerender(<LinkToVndbButton vnId="egs_6" seedQuery="Title Z" />);
    await act(async () => {
      staleSearch('late query');
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
