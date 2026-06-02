// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { CoverEditOverlay } from '@/components/CoverEditOverlay';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

describe('CoverEditOverlay', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches the scoped open-cover-picker event and stops propagation', async () => {
    const onOpen = vi.fn();
    const onParentClick = vi.fn();
    window.addEventListener('vn:open-cover-picker', onOpen as EventListener);
    const { user } = renderWithProviders(
      <div onClick={onParentClick}>
        <CoverEditOverlay vnId="v90002" />
      </div>,
    );
    const btn = screen.getByRole('button');
    await user.click(btn);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect((onOpen.mock.calls[0][0] as CustomEvent<{ vnId: string }>).detail.vnId).toBe('v90002');
    // stopPropagation means the wrapping div onClick must not fire.
    expect(onParentClick).not.toHaveBeenCalled();
    window.removeEventListener('vn:open-cover-picker', onOpen as EventListener);
  });
});
