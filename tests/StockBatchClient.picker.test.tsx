// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { StockBatchClient } from '@/components/StockBatchClient';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock('@/components/VnSourcePicker', () => ({
  VnSourcePicker: ({
    onPick,
    disabled,
  }: {
    onPick: (hit: { id: string; title: string }) => void;
    disabled?: boolean;
  }) => (
    <div>
      <button type="button" disabled={disabled} onClick={() => onPick({ id: 'bad-id', title: 'Invalid VN' })}>
        Pick invalid
      </button>
      <button type="button" disabled={disabled} onClick={() => onPick({ id: 'v999999', title: 'Overflow VN' })}>
        Pick overflow
      </button>
    </div>
  ),
}));

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('StockBatchClient picker additions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith('/api/settings')) return Promise.resolve(json({}));
      if (url.startsWith('/api/stock/queue')) {
        const parsed = new URL(url, 'http://localhost');
        const page = Number(parsed.searchParams.get('page') ?? '1');
        return Promise.resolve(json({
          entries: Array.from({ length: 500 }, (_, i) => {
            const index = (page - 1) * 500 + i;
            return { vn_id: `v${100000 + index}`, title: `Cap ${index}` };
          }),
          next_page: page < 10 ? page + 1 : null,
        }));
      }
      return Promise.resolve(json({}));
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ignores invalid picker ids', async () => {
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Pick invalid' }));
    expect(screen.queryByText(/Queue \(/)).toBeNull();
  });

  it('shows the capacity warning when adding from the picker at the queue cap', async () => {
    renderWithProviders(<StockBatchClient />, { locale: 'en' });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Whole collection' }));
    await flush();
    expect(screen.getByText('Queue (5000)')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pick overflow' }));
    expect(screen.getByText('The queue is limited to 5000 VNs. Run this queue before adding more.')).not.toBeNull();
  });
});
