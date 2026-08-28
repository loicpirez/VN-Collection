// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VnCard, type CardData } from '@/components/VnCard';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}));

vi.mock('@/components/ToastProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ToastProvider')>();
  return {
    ...actual,
    useToast: () => toastMocks,
  };
});

vi.mock('@/components/TitleLine', () => ({
  useResolvedTitle: (title: string, alttitle: string | null) => ({
    main: title,
    sub: alttitle,
  }),
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt, localSrc, src }: { alt: string; localSrc: string | null; src: string | null }) => (
    <img alt={alt} data-local={localSrc ?? ''} {...(src ? { src } : {})} />
  ),
}));

vi.mock('@/components/StatusBadge', () => ({
  StatusBadge: ({ status }: { status: string }) => <div>{`status:${status}`}</div>,
}));

vi.mock('@/components/FavoriteToggleButton', () => ({
  FavoriteToggleButton: ({ inCollection, initial, vnId }: { inCollection: boolean; initial: boolean; vnId: string }) => (
    <div>{`favorite:${vnId}:${initial}:${inCollection}`}</div>
  ),
}));

vi.mock('@/components/ListsPickerButton', () => ({
  ListsPickerButton: ({ initialMemberCount, vnId }: { initialMemberCount: number; vnId: string }) => <div>{`lists:${vnId}:${initialMemberCount}`}</div>,
}));

vi.mock('@/components/CardContextMenu', () => ({
  CardContextMenu: ({ anchor, developer, onClose, publisher, status, vnId }: {
    anchor: { x: number; y: number };
    developer: { name: string } | null;
    onClose: () => void;
    publisher: { name: string } | null;
    status: string | null;
    vnId: string;
  }) => (
    <div>
      {`menu:${vnId}:${status ?? 'none'}:${developer?.name ?? 'none'}:${publisher?.name ?? 'none'}:${anchor.x}:${anchor.y}`}
      <button type="button" onClick={onClose}>close-menu</button>
    </div>
  ),
}));

const t = dictionaries.en;

function card(overrides: Partial<CardData> = {}): CardData {
  return {
    id: 'v90001',
    title: 'Card title',
    poster: null,
    released: null,
    rating: null,
    ...overrides,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: Error) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (reason?: Error) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

beforeEach(() => {
  routerMocks.refresh.mockReset();
  toastMocks.error.mockReset();
  toastMocks.success.mockReset();
  vi.useRealTimers();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('VnCard', () => {
  it('renders a rich selected card and responds to click and keyboard selection', () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <VnCard
        selectable
        selected
        onSelect={onSelect}
        badge={{ label: 'Relation', tone: 'muted' }}
        data={card({
          alttitle: 'Alternate',
          poster: 'remote.jpg',
          localPoster: 'local.jpg',
          customCover: 'custom.jpg',
          sexual: 2,
          released: '2020-01-02',
          user_rating: 90,
          egs_median: 82.4,
          playtime_minutes: 60,
          length_minutes: 120,
          egs_playtime_minutes: 180,
          editionType: 'collector',
          aspectKeys: ['16:9', '4:3', '16:10', 'unknown'],
          favorite: true,
          inReadingQueue: true,
          isFanDisc: true,
          developers: [{ id: 'p1', name: 'Developer' }, { id: 'p2', name: 'Second developer' }],
          publishers: [
            { id: 'p1', name: 'Developer' },
            { id: 'p3', name: 'Publisher' },
            { id: 'p4', name: 'Second publisher' },
          ],
        })}
      />,
      { locale: 'en' },
    );

    const selectable = screen.getByRole('button', { name: 'Card title' });
    expect(selectable).toHaveAttribute('aria-pressed', 'true');
    expect(selectable).toHaveClass('min-h-0', 'w-full', 'flex-1', 'self-stretch');
    expect(screen.getByAltText('Card title')).toHaveAttribute('data-local', 'custom.jpg');
    expect(screen.getByText('Relation')).toBeInTheDocument();
    expect(screen.getByText(t.library.fanDisc)).toBeInTheDocument();
    expect(screen.getByText('9.0')).toBeInTheDocument();
    expect(screen.getByText('82')).toBeInTheDocument();
    expect(screen.getByText('16:9 +2')).toBeInTheDocument();
    const aspectChip = screen.getByTitle(`${t.aspectOverride.title}: 16:9 / 4:3 / 16:10`);
    expect(aspectChip).toBeInTheDocument();
    expect(aspectChip).toHaveClass('px-0.5', 'text-[10px]', 'whitespace-nowrap');
    expect(aspectChip.closest('[data-card-facts]')).toHaveClass('gap-x-1.5');
    expect(screen.getByText('Developer')).toBeInTheDocument();
    expect(screen.getByText('Publisher')).toBeInTheDocument();
    const producerRow = screen.getByText('Developer').closest('[data-card-producers]');
    expect(producerRow).toContainElement(screen.getByText('Publisher'));
    const developerChip = screen.getByTitle(`${t.detail.developers}: Developer, Second developer`);
    const publisherChip = screen.getByTitle(`${t.detail.publishers}: Publisher, Second publisher`);
    expect(developerChip).toHaveClass('min-w-0', 'flex-1');
    expect(publisherChip).toHaveClass('min-w-0', 'flex-1');
    expect(developerChip).toHaveTextContent('Developer +1');
    expect(publisherChip).toHaveTextContent('Publisher +1');

    fireEvent.click(selectable);
    fireEvent.keyDown(selectable, { key: 'Enter' });
    fireEvent.keyDown(selectable, { key: ' ' });
    fireEvent.keyDown(selectable, { key: 'Escape' });
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it('carries list metadata on the card root without an intermediate sizing wrapper', () => {
    renderWithProviders(
      <VnCard data={card()} listPosition={4} listSize={20} />,
      { locale: 'en' },
    );

    const listItem = screen.getByRole('listitem');
    expect(listItem).toHaveAttribute('aria-posinset', '4');
    expect(listItem).toHaveAttribute('aria-setsize', '20');
    expect(listItem).toHaveClass('self-stretch');
  });

  it('keeps remote custom covers remote instead of routing them through local files', () => {
    renderWithProviders(
      <VnCard
        data={card({
          poster: 'https://images.example.test/default.jpg',
          localPoster: 'images/default.jpg',
          customCover: 'https://images.example.test/custom.jpg',
        })}
      />,
      { locale: 'en' },
    );

    expect(screen.getByAltText('Card title')).toHaveAttribute('src', 'https://images.example.test/custom.jpg');
    expect(screen.getByAltText('Card title')).toHaveAttribute('data-local', '');
  });

  it('opens and closes collection context menus through overflow, contextmenu, and touch long-press', () => {
    vi.useFakeTimers();
    renderWithProviders(
      <VnCard data={card({
        status: 'playing',
        developers: [{ id: 'p1', name: 'Developer' }],
        publishers: [{ id: 'p1', name: 'Same developer' }, { id: 'p2', name: 'Publisher' }],
      })} />,
      { locale: 'en' },
    );

    const overflow = screen.getByRole('button', { name: t.quickActions.title });
    const link = screen.getByRole('link');
    expect(link).not.toContainElement(overflow);
    vi.spyOn(overflow, 'getBoundingClientRect').mockReturnValue({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      top: 2,
      right: 4,
      bottom: 6,
      left: 1,
      toJSON: () => ({}),
    });
    const actionTouch = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(actionTouch, 'pointerType', { value: 'touch' });
    fireEvent(overflow, actionTouch);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByText(/menu:v90001/)).toBeNull();
    fireEvent.click(overflow);
    expect(screen.getByText(/menu:v90001:playing:Developer:Publisher:4:6/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'close-menu' }));
    expect(screen.queryByText(/menu:v90001/)).toBeNull();

    fireEvent.contextMenu(link, { clientX: 7, clientY: 8 });
    expect(screen.getByText(/menu:v90001:playing:Developer:Publisher:7:8/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'close-menu' }));

    const mouseDown = new Event('pointerdown', { bubbles: true });
    Object.defineProperties(mouseDown, {
      pointerType: { value: 'mouse' },
      clientX: { value: 9 },
      clientY: { value: 10 },
    });
    fireEvent(link, mouseDown);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByText(/menu:v90001/)).toBeNull();

    const touchDown = new Event('pointerdown', { bubbles: true });
    Object.defineProperties(touchDown, {
      pointerType: { value: 'touch' },
      clientX: { value: 11 },
      clientY: { value: 12 },
    });
    fireEvent(link, touchDown);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByText(/menu:v90001:playing:Developer:Publisher:11:12/)).toBeInTheDocument();
    fireEvent.click(link);
    fireEvent.pointerUp(link);
    fireEvent.pointerLeave(link);
    fireEvent.pointerCancel(link);
  });

  it('does not open a context menu for bare or selectable cards', () => {
    vi.useFakeTimers();
    const { rerender } = renderWithProviders(<VnCard data={card()} />, { locale: 'en' });
    const link = screen.getByRole('link');
    fireEvent.contextMenu(link);
    expect(screen.queryByText(/menu:v90001/)).toBeNull();

    const touchDown = new Event('pointerdown', { bubbles: true });
    Object.defineProperties(touchDown, {
      pointerType: { value: 'touch' },
      clientX: { value: 1 },
      clientY: { value: 2 },
    });
    fireEvent(link, touchDown);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByText(/menu:v90001/)).toBeNull();

    rerender(<VnCard selectable data={card({ status: 'playing' })} />);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Card title' }));
    expect(screen.queryByText(/menu:v90001/)).toBeNull();
  });

  it('adds a bare card to the collection and applies the immediate local badge', async () => {
    const onAdded = vi.fn();
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    renderWithProviders(<VnCard data={card()} enableAdd onAdded={onAdded} />, { locale: 'en' });

    const add = screen.getByRole('button', { name: t.cardAdd });
    expect(add).toHaveClass('min-h-[44px]', 'min-w-[44px]', 'can-hover:sm:min-h-7', 'can-hover:sm:min-w-0');
    fireEvent.click(add);

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith(t.toast.added));
    expect(onAdded).toHaveBeenCalledWith('v90001');
    expect(routerMocks.refresh).toHaveBeenCalled();
    expect(screen.getByText(t.search.inCollection)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/collection/v90001', expect.objectContaining({ method: 'POST' }));
  });

  it('reports add errors and triggers keyboard add only for activation keys', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'add failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    }));
    renderWithProviders(<VnCard data={card({ id: 'v90002' })} enableAdd />, { locale: 'en' });

    const add = screen.getByRole('button', { name: t.cardAdd });
    fireEvent.keyDown(add, { key: 'Escape' });
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.keyDown(add, { key: 'Enter' });

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('add failed'));
  });

  it('suppresses duplicate adds and ignores stale successful responses after identity changes', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    const { rerender } = renderWithProviders(<VnCard data={card()} enableAdd />, { locale: 'en' });

    const add = screen.getByRole('button', { name: t.cardAdd });
    fireEvent.click(add);
    fireEvent.click(add);
    expect(fetch).toHaveBeenCalledTimes(1);
    rerender(<VnCard data={card({ id: 'v90003' })} enableAdd />);
    await act(async () => pending.resolve(new Response('{}', { status: 200 })));

    expect(toastMocks.success).not.toHaveBeenCalled();
  });

  it('ignores stale rejected responses after identity changes', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    const { rerender } = renderWithProviders(<VnCard data={card()} enableAdd />, { locale: 'en' });

    fireEvent.click(screen.getByRole('button', { name: t.cardAdd }));
    rerender(<VnCard data={card({ id: 'v90004' })} enableAdd />);
    await act(async () => pending.reject(new Error('late failure')));

    expect(toastMocks.error).not.toHaveBeenCalled();
  });

  it('removes wishlist cards unless a removal is already running', () => {
    const remove = vi.fn();
    const { rerender } = renderWithProviders(
      <VnCard data={card()} onRemoveFromWishlist={remove} />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.wishlist.removeOne }));
    expect(remove).toHaveBeenCalledTimes(1);

    rerender(<VnCard data={card()} onRemoveFromWishlist={remove} removingFromWishlist />);
    fireEvent.click(screen.getByRole('button', { name: t.wishlist.removeOne }));
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('renders sparse metadata fallbacks and an accent badge', () => {
    renderWithProviders(
      <VnCard
        badge={{ label: 'New' }}
        data={card({
          rating: 75,
          released: '2022',
          editionType: 'none',
          aspectKeys: ['unknown'],
          egs_playtime_minutes: 45,
          publishers: [{ name: 'Publisher only' }],
          inCollectionBadge: true,
          listCount: 2,
        })}
      />,
      { locale: 'en' },
    );

    expect(screen.getByText('7.5')).toBeInTheDocument();
    expect(screen.getByText('2022')).toBeInTheDocument();
    expect(screen.getByText('Publisher only')).toBeInTheDocument();
    expect(screen.getByText('lists:v90001:2')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.queryByTitle(t.aspectOverride.title)).toBeNull();
  });

  it('positions queue and fan-disc indicators around an overflow action without a relation badge', () => {
    renderWithProviders(
      <VnCard
        data={card({
          status: 'playing',
          inReadingQueue: true,
          isFanDisc: true,
        })}
      />,
      { locale: 'en' },
    );

    expect(screen.getByText(t.library.moreFilters.inReadingQueue).previousElementSibling).toHaveClass('bottom-2');
    expect(screen.getByText(t.library.fanDisc).closest('span')).toHaveClass('bottom-14');
  });

  it('renders a single aspect and mine-only playtime while dropping duplicate publishers', () => {
    renderWithProviders(
      <VnCard
        data={card({
          playtime_minutes: 30,
          aspectKeys: ['4:3'],
          developers: [{ id: 'p1', name: 'Shared studio' }],
          publishers: [{ id: 'p1', name: 'Shared studio' }],
        })}
      />,
      { locale: 'en' },
    );

    expect(screen.getByText('4:3')).toBeInTheDocument();
    expect(screen.getAllByText('30min')).toHaveLength(2);
    expect(screen.queryByTitle(`${t.detail.publishers}: Shared studio`)).toBeNull();
  });

  it('prioritizes a concrete aspect ratio over the generic other bucket', () => {
    renderWithProviders(
      <VnCard data={card({ aspectKeys: ['other', '4:3'] })} />,
      { locale: 'en' },
    );

    expect(screen.getByText('4:3 +1')).toBeInTheDocument();
    expect(screen.getByTitle(`${t.aspectOverride.title}: 4:3 / Other`)).toBeInTheDocument();
  });

  it('opens an in-collection badge menu without optional status, developer, or publisher props', () => {
    renderWithProviders(<VnCard data={card({ inCollectionBadge: true })} />, { locale: 'en' });
    fireEvent.contextMenu(screen.getByRole('link'), { clientX: 3, clientY: 4 });
    expect(screen.getByText('menu:v90001:none:none:none:3:4')).toBeInTheDocument();
  });

  it('opens a menu for a publisher without an external id', () => {
    renderWithProviders(
      <VnCard data={card({ inCollectionBadge: true, publishers: [{ name: 'Publisher without id' }] })} />,
      { locale: 'en' },
    );
    fireEvent.contextMenu(screen.getByRole('link'), { clientX: 5, clientY: 6 });
    expect(screen.getByText('menu:v90001:none:none:Publisher without id:5:6')).toBeInTheDocument();
  });
});
