// @vitest-environment jsdom
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

describe('StockPhysicalLocations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the empty state when there are no offers', () => {
    renderWithProviders(<StockPhysicalLocations offers={[]} />);
    expect(screen.getByText(t.stock.physicalLocationsEmpty as string)).toBeTruthy();
    // No count badge when zero offers.
    expect(screen.queryByLabelText('0')).toBeNull();
  });

  it('groups offers by branch, sorts within a branch by price, and renders a count badge', () => {
    const { container } = renderWithProviders(
      <StockPhysicalLocations
        offers={[
          offer({ url: 'https://example.test/a', price: 3000, location_branch: 'Branch Alpha', condition: 'new' }),
          offer({ url: 'https://example.test/b', price: 900, location_branch: 'Branch Alpha', condition: 'used' }),
          offer({ url: 'https://example.test/c', price: 2000, location_branch: 'Branch Beta' }),
        ]}
      />,
    );
    // Total offer count badge in the header.
    expect(screen.getByLabelText('3')).toBeTruthy();
    // Both branches render.
    expect(screen.getByText('Branch Alpha')).toBeTruthy();
    expect(screen.getByText('Branch Beta')).toBeTruthy();
    // Price elements rendered for every offer (3 offers => 3 price cells).
    const priceCells = container.querySelectorAll('.font-black');
    expect(priceCells.length).toBe(3);
    // Within Branch Alpha the cheaper (900) offer sorts before the pricier (3000).
    const alphaList = screen.getByText('Branch Alpha').closest('.rounded-lg')!;
    const alphaPrices = Array.from(alphaList.querySelectorAll('.font-black')).map((el) => el.textContent ?? '');
    const digits = alphaPrices.map((s) => Number(s.replace(/[^\d]/g, '')));
    expect(digits).toEqual([900, 3000]);
  });

  it('renders a places link when placeMap has the branch, otherwise a plain label', () => {
    renderWithProviders(
      <StockPhysicalLocations
        offers={[
          offer({ location_branch: 'Linked Branch', url: 'https://example.test/linked' }),
          offer({ location_branch: 'Unlinked Branch', url: 'https://example.test/unlinked' }),
        ]}
        placeMap={{ 'Linked Branch': 42 }}
      />,
    );
    const link = screen.getByRole('link', { name: /Linked Branch/ });
    expect(link.getAttribute('href')).toBe('/places/42');
    // Unlinked branch is plain text, not a places link.
    expect(screen.queryByRole('link', { name: /Unlinked Branch/ })).toBeNull();
    expect(screen.getByText('Unlinked Branch')).toBeTruthy();
  });

  it('falls back to location_label then provider_label when branch is missing', () => {
    const { container } = renderWithProviders(
      <StockPhysicalLocations
        offers={[
          offer({ location_branch: null, location_label: 'Label Fallback', provider_label: 'PL', url: 'https://example.test/x' }),
          offer({ location_branch: null, location_label: null, provider_label: 'Provider Only', url: 'https://example.test/y' }),
        ]}
      />,
    );
    // location_label is used as the group heading when branch is null.
    expect(screen.getByText('Label Fallback')).toBeTruthy();
    // provider_label heads its own group; it also appears as a per-offer chip,
    // so scope the assertion to the branch heading (the font-bold heading span).
    const headings = Array.from(container.querySelectorAll('.font-bold')).map((el) => el.textContent ?? '');
    expect(headings).toContain('Provider Only');
  });

  it('renders an external open-shop link only for safe URLs and a dash for null prices', () => {
    renderWithProviders(
      <StockPhysicalLocations
        offers={[
          offer({ url: 'https://example.test/ok', price: null, location_branch: 'Safe Branch' }),
          offer({ url: 'javascript:alert(1)', price: 800, location_branch: 'Unsafe Branch' }),
        ]}
      />,
    );
    // Null price renders a dash.
    expect(screen.getByText('-')).toBeTruthy();
    const shopLinks = screen.getAllByRole('link', { name: new RegExp(t.stock.openShop as string) });
    // Only the safe URL produces an anchor.
    expect(shopLinks).toHaveLength(1);
    expect(shopLinks[0].getAttribute('href')).toBe('https://example.test/ok');
  });

  it('maps legacy English condition strings to localized labels', () => {
    renderWithProviders(
      <StockPhysicalLocations
        offers={[offer({ condition: 'Used', location_branch: 'Cond Branch', url: 'https://example.test/cond' })]}
      />,
    );
    const expected = (t.stock.conditionLabels as Record<string, string>).used;
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it('shows a per-branch count badge when a branch has more than one offer', () => {
    renderWithProviders(
      <StockPhysicalLocations
        offers={[
          offer({ url: 'https://example.test/m1', location_branch: 'Multi' }),
          offer({ url: 'https://example.test/m2', location_branch: 'Multi' }),
        ]}
      />,
    );
    // Header total badge (2) plus per-branch badge (2): at least two labelled "2".
    expect(screen.getAllByLabelText('2').length).toBeGreaterThanOrEqual(2);
  });

  it('paginates branches when there are more than the page size and resets to page 1 on new offers', () => {
    const many: PhysicalOffer[] = Array.from({ length: 10 }, (_v, i) =>
      offer({ location_branch: `Branch ${String(i).padStart(2, '0')}`, url: `https://example.test/p${i}`, price: 100 + i }),
    );
    const { rerender } = renderWithProviders(<StockPhysicalLocations offers={many} />);
    const nav = screen.getByRole('navigation', { name: t.stock.physicalPaginationLabel as string });
    expect(nav).toBeTruthy();
    const prev = within(nav).getByRole('button', { name: t.stock.previousPage as string });
    const next = within(nav).getByRole('button', { name: t.stock.nextPage as string });
    // On page 1, previous is disabled.
    expect((prev as HTMLButtonElement).disabled).toBe(true);
    expect((next as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(next);
    // Page 2 now: previous enabled, next disabled (10 branches / 8 per page = 2 pages).
    expect((within(nav).getByRole('button', { name: t.stock.previousPage as string }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(nav).getByRole('button', { name: t.stock.nextPage as string }) as HTMLButtonElement).disabled).toBe(true);
    // Go back.
    fireEvent.click(within(nav).getByRole('button', { name: t.stock.previousPage as string }));
    expect((within(nav).getByRole('button', { name: t.stock.previousPage as string }) as HTMLButtonElement).disabled).toBe(true);
    // Advance then change offers: the page index resets to 1.
    fireEvent.click(within(nav).getByRole('button', { name: t.stock.nextPage as string }));
    rerender(<StockPhysicalLocations offers={[offer({ location_branch: 'Solo', url: 'https://example.test/solo' })]} />);
    // Single branch now -> no pagination nav at all.
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
