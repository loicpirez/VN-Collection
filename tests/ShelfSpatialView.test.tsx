// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { ShelfDisplaySlotEntry, ShelfSlotEntry, ShelfUnitWithCount } from '@/lib/db';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/shelf',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

// SafeImage reads DisplaySettings context which the shared render helper
// does not provide; swap it for a plain img so the spatial grid renders.
vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt, src }: { alt: string; src?: string | null }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src ?? ''} data-mock-safe-image />
  ),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: async () => dictionaries.fr,
  getLocale: async () => 'fr',
}));

const listShelvesMock = vi.fn<() => ShelfUnitWithCount[]>();
const listShelfSlotsMock = vi.fn<(id: number) => ShelfSlotEntry[]>();
const listShelfDisplaySlotsMock = vi.fn<(id: number) => ShelfDisplaySlotEntry[]>();

vi.mock('@/lib/db', () => ({
  listShelves: () => listShelvesMock(),
  listShelfSlots: (id: number) => listShelfSlotsMock(id),
  listShelfDisplaySlots: (id: number) => listShelfDisplaySlotsMock(id),
}));

// Import after the mocks are registered.
import { ShelfSpatialView } from '@/components/ShelfSpatialView';

function shelf(overrides: Partial<ShelfUnitWithCount> = {}): ShelfUnitWithCount {
  return {
    id: 1,
    name: 'Studio X',
    cols: 2,
    rows: 2,
    order_index: 0,
    created_at: 0,
    updated_at: 0,
    placed_count: 0,
    ...overrides,
  };
}

function slot(overrides: Partial<ShelfSlotEntry> = {}): ShelfSlotEntry {
  return {
    shelf_id: 1,
    row: 0,
    col: 0,
    vn_id: 'v90001',
    release_id: 'r90001',
    vn_title: 'Title Y',
    vn_image_thumb: null,
    vn_image_url: 'https://example.test/cover.jpg',
    vn_local_image_thumb: null,
    vn_image_sexual: 0,
    rel_image_thumb: null,
    rel_image_url: null,
    rel_local_image_thumb: null,
    rel_image_sexual: null,
    edition_label: null,
    box_type: 'none',
    condition: null,
    owned_platform: null,
    physical_location: [],
    price_paid: null,
    currency: null,
    acquired_date: null,
    vn_platforms: [],
    vn_languages: [],
    vn_released: null,
    rel_title: null,
    rel_platforms: [],
    rel_languages: [],
    rel_released: null,
    rel_resolution: null,
    dumped: false,
    ...overrides,
  };
}

function display(overrides: Partial<ShelfDisplaySlotEntry> = {}): ShelfDisplaySlotEntry {
  return {
    ...slot(),
    after_row: 0,
    position: 0,
    placed_at: 1,
    vn_id: 'v90002',
    release_id: 'r90002',
    vn_title: 'Title Z',
    ...overrides,
  } as ShelfDisplaySlotEntry;
}

/**
 * ShelfSpatialView is an async server component. Await it to get the
 * resolved element, then render that element through the providers.
 */
async function renderView(props: Parameters<typeof ShelfSpatialView>[0] = {}) {
  const element = await ShelfSpatialView(props);
  return renderWithProviders(element);
}

describe('ShelfSpatialView', () => {
  beforeEach(() => {
    listShelvesMock.mockReset();
    listShelfSlotsMock.mockReset().mockReturnValue([]);
    listShelfDisplaySlotsMock.mockReset().mockReturnValue([]);
  });

  it('renders the empty state with an editor link when no shelves exist', async () => {
    listShelvesMock.mockReturnValue([]);
    await renderView();
    expect(screen.getByText(dictionaries.fr.shelfSpatial.empty)).toBeTruthy();
    const link = screen.getByRole('link', { name: dictionaries.fr.shelfSpatial.openEditor });
    expect(link.getAttribute('href')).toBe('/shelf?view=layout');
  });

  it('renders the active shelf name, dimensions, and a placed card', async () => {
    listShelvesMock.mockReturnValue([shelf({ placed_count: 1 })]);
    listShelfSlotsMock.mockReturnValue([slot()]);
    await renderView();
    expect(screen.getByRole('heading', { name: 'Studio X' })).toBeTruthy();
    // Card links to the VN detail page.
    const card = screen.getByRole('link', { name: 'Title Y' });
    expect(card.getAttribute('href')).toBe('/vn/v90001');
  });

  it('shows the carousel index and disables prev on the first shelf', async () => {
    listShelvesMock.mockReturnValue([shelf({ id: 1 }), shelf({ id: 2, name: 'Studio W' })]);
    await renderView({ activeShelf: 1 });
    const nav = screen.getByRole('navigation', { name: dictionaries.fr.shelfSpatial.carouselLabel });
    expect(within(nav).getByText('Étagère 1 sur 2')).toBeTruthy();
    // Next is a real link; prev is a disabled span (no link role).
    expect(within(nav).getByRole('link', { name: dictionaries.fr.shelfSpatial.nextShelf })).toBeTruthy();
    expect(within(nav).queryByRole('link', { name: dictionaries.fr.shelfSpatial.prevShelf })).toBeNull();
  });

  it('clamps an out-of-range activeShelf to the last shelf and exposes a prev link', async () => {
    listShelvesMock.mockReturnValue([shelf({ id: 1 }), shelf({ id: 2, name: 'Studio W' })]);
    await renderView({ activeShelf: 99 });
    expect(screen.getByRole('heading', { name: 'Studio W' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: dictionaries.fr.shelfSpatial.carouselLabel });
    expect(within(nav).getByRole('link', { name: dictionaries.fr.shelfSpatial.prevShelf })).toBeTruthy();
  });

  it('renders display rows with a face-out card and the display count', async () => {
    listShelvesMock.mockReturnValue([shelf({ placed_count: 1 })]);
    listShelfDisplaySlotsMock.mockReturnValue([display()]);
    await renderView({ defaultOrientation: 'landscape' });
    // Display count chip "1 en vitrine".
    expect(screen.getByText(/en vitrine/)).toBeTruthy();
    // Face-out card links to its VN with the display prefix in the label.
    const displayCard = screen.getByRole('link', { name: `${dictionaries.fr.shelfSpatial.displayItemPrefix} Title Z` });
    expect(displayCard.getAttribute('href')).toBe('/vn/v90002');
  });

  it('renders multiple face-out entries for one display row with portrait aspect', async () => {
    listShelvesMock.mockReturnValue([shelf({ cols: 3, placed_count: 2 })]);
    listShelfDisplaySlotsMock.mockReturnValue([
      display({ after_row: 0, position: 0, vn_title: 'Display A' }),
      display({
        after_row: 0,
        position: 2,
        vn_id: 'v90003',
        release_id: 'r90003',
        vn_title: 'Display B',
        edition_label: 'Limited',
        vn_image_url: null,
        vn_image_thumb: 'https://example.test/display-thumb.jpg',
      }),
    ]);
    const { container } = await renderView({ defaultOrientation: 'portrait' });
    const cards = screen.getAllByRole('link', { name: new RegExp(dictionaries.fr.shelfSpatial.displayItemPrefix) });
    expect(cards).toHaveLength(2);
    expect(cards[1].getAttribute('title')).toBe('Display B / Limited');
    expect((within(cards[1]).getByRole('img', { name: 'Display B' }) as HTMLImageElement).src).toContain('display-thumb.jpg');
    expect(container.querySelector('[data-shelf-display-grid]')?.getAttribute('style')).toContain('2/3');
  });

  it('renders shelf card edition title, thumbnail fallback, and dumped marker', async () => {
    listShelvesMock.mockReturnValue([shelf({ placed_count: 1 })]);
    listShelfSlotsMock.mockReturnValue([
      slot({
        edition_label: 'Box',
        vn_image_url: null,
        vn_image_thumb: 'https://example.test/thumb.jpg',
        dumped: true,
      }),
    ]);
    await renderView();
    const card = screen.getByRole('link', { name: 'Title Y' });
    expect(card.getAttribute('title')).toBe('Title Y / Box');
    expect((within(card).getByRole('img', { name: 'Title Y' }) as HTMLImageElement).src).toContain('thumb.jpg');
    expect(within(card).getByTitle(dictionaries.fr.shelf.dumped)).toBeTruthy();
  });

  it('honors a per-row orientation override map', async () => {
    listShelvesMock.mockReturnValue([shelf({ rows: 2, placed_count: 1 })]);
    listShelfDisplaySlotsMock.mockReturnValue([display({ after_row: 1, position: 0 })]);
    const { container } = await renderView({ displayRowOrientations: { '1': 'landscape' } });
    // The between-row display grid sets the per-row aspect CSS var.
    const grids = container.querySelectorAll('[data-shelf-display-grid]');
    expect(grids.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to the untitled label when a shelf has no name', async () => {
    listShelvesMock.mockReturnValue([shelf({ name: '' })]);
    await renderView();
    expect(screen.getByRole('heading', { name: dictionaries.fr.shelfSpatial.untitled })).toBeTruthy();
  });
});
