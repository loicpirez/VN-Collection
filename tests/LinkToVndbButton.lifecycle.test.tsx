// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { dictionaries } from '@/lib/i18n/dictionaries';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
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
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { headers: { 'content-type': 'application/json' } }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('ignores a stale debounced search callback after the component identity changes', async () => {
    vi.useFakeTimers();
    try {
      const view = renderWithProviders(
        <LinkToVndbButton vnId="egs_5" seedQuery="Title Y" />,
        { locale: 'en' },
      );
      fireEvent.click(screen.getByRole('button', { name: new RegExp(t.linkVndb.cta) }));
      const dialog = screen.getByRole('dialog');
      vi.mocked(global.fetch).mockClear();
      fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'late query' } });
      view.rerender(<LinkToVndbButton vnId="egs_6" seedQuery="Title Z" />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(global.fetch).not.toHaveBeenCalled();
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });
});
