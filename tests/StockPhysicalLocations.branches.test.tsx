// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { StockPhysicalLocations, type PhysicalOffer } from '@/components/StockPhysicalLocations';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries[DEFAULT_LOCALE];

function offer(over: Partial<PhysicalOffer> = {}): PhysicalOffer {
  return {
    provider: 'suruga',
    provider_label: 'Studio X Shop',
    title: 'Title Y',
    url: 'https://example.test/item/1',
    price: 1500,
    availability: 'in_stock',
    location_label: 'Branch Alpha',
    location_branch: 'Branch Alpha',
    condition: 'used',
    ...over,
  };
}

describe('StockPhysicalLocations branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to location_label when location_branch is whitespace-only', () => {
    const { container } = renderWithProviders(
      <StockPhysicalLocations
        offers={[offer({ location_branch: '   ', location_label: 'Label Group', url: 'https://example.test/ws' })]}
      />,
    );
    const headings = Array.from(container.querySelectorAll('.font-bold')).map((el) => el.textContent ?? '');
    expect(headings).toContain('Label Group');
  });

  it('passes an unknown condition slug through unchanged', () => {
    renderWithProviders(
      <StockPhysicalLocations
        offers={[offer({ condition: 'mint-condition-unknown', location_branch: 'Cond Branch', url: 'https://example.test/cond' })]}
      />,
    );
    // No mapping for the slug -> the raw value renders verbatim.
    expect(screen.getByText('mint-condition-unknown')).toBeTruthy();
  });

  it('sorts unpriced branches after priced ones (MAX_SAFE comparison)', () => {
    const { container } = renderWithProviders(
      <StockPhysicalLocations
        offers={[
          offer({ location_branch: 'Unpriced Branch', price: null, url: 'https://example.test/np' }),
          offer({ location_branch: 'Priced Branch', price: 500, url: 'https://example.test/p' }),
        ]}
      />,
    );
    const headings = Array.from(container.querySelectorAll('.rounded-lg .font-bold')).map((el) => el.textContent ?? '');
    const pricedIdx = headings.indexOf('Priced Branch');
    const unpricedIdx = headings.indexOf('Unpriced Branch');
    expect(pricedIdx).toBeGreaterThanOrEqual(0);
    expect(unpricedIdx).toBeGreaterThan(pricedIdx);
  });

  it('sorts priced offers before unpriced offers inside one branch', () => {
    const { container } = renderWithProviders(
      <StockPhysicalLocations
        offers={[
          offer({ title: 'Unpriced first', location_branch: 'Mixed', price: null, url: 'https://example.test/mixed-a' }),
          offer({ title: 'Priced middle', location_branch: 'Mixed', price: 700, url: 'https://example.test/mixed-b' }),
          offer({ title: 'Unpriced last', location_branch: 'Mixed', price: null, url: 'https://example.test/mixed-c' }),
        ]}
      />,
    );
    const rows = Array.from(container.querySelectorAll('li')).map((el) => el.textContent ?? '');
    expect(rows[0]).toContain('Priced middle');
  });

  it('clamps the page index when the offer set shrinks but still paginates', () => {
    const many: PhysicalOffer[] = Array.from({ length: 16 }, (_v, i) =>
      offer({ location_branch: `Branch ${String(i).padStart(2, '0')}`, url: `https://example.test/p${i}`, price: 100 + i }),
    );
    const { rerender } = renderWithProviders(<StockPhysicalLocations offers={many} />);
    const nav = screen.getByRole('navigation', { name: t.stock.physicalPaginationLabel as string });
    // 16 branches / 8 per page = 2 pages. Move to the last page.
    fireEvent.click(within(nav).getByRole('button', { name: t.stock.nextPage as string }));
    // The offers effect resets page to 1; the new set still has 2 pages and is valid.
    const shrunk: PhysicalOffer[] = Array.from({ length: 9 }, (_v, i) =>
      offer({ location_branch: `Branch ${String(i).padStart(2, '0')}`, url: `https://example.test/s${i}`, price: 200 + i }),
    );
    rerender(<StockPhysicalLocations offers={shrunk} />);
    const nav2 = screen.getByRole('navigation', { name: t.stock.physicalPaginationLabel as string });
    // Page reset to 1 -> previous disabled, next enabled (9 / 8 = 2 pages).
    expect((within(nav2).getByRole('button', { name: t.stock.previousPage as string }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(nav2).getByRole('button', { name: t.stock.nextPage as string }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders no per-branch count badge for a single-offer branch', () => {
    renderWithProviders(
      <StockPhysicalLocations offers={[offer({ location_branch: 'Solo', url: 'https://example.test/solo' })]} />,
    );
    // Header total badge shows "1"; there is no per-branch "1" badge.
    expect(screen.getAllByLabelText('1')).toHaveLength(1);
  });
});
