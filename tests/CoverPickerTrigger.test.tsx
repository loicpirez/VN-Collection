// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { CoverPickerTrigger } from '@/components/CoverPickerTrigger';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

describe('CoverPickerTrigger', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the supplied className and dispatches the open-cover-picker event on click', async () => {
    const onOpen = vi.fn();
    window.addEventListener('vn:open-cover-picker', onOpen as EventListener);
    const { user, container } = renderWithProviders(
      <CoverPickerTrigger vnId="v90001" className="btn custom-trigger" />,
    );
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('custom-trigger');
    expect(container.querySelector('[data-menu-keep-open]')).not.toBeNull();

    await user.click(btn);
    expect(onOpen).toHaveBeenCalledTimes(1);
    const ev = onOpen.mock.calls[0][0] as CustomEvent<{ vnId: string }>;
    expect(ev.detail.vnId).toBe('v90001');
    window.removeEventListener('vn:open-cover-picker', onOpen as EventListener);
  });
});
