// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from './helpers/render-component';
import { GroupedNav, MoreNavMenu } from '@/components/MoreNavMenu';
import { dictionaries } from '@/lib/i18n/dictionaries';

let mockPathname: string | null = '/';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;

beforeEach(() => {
  mockPathname = '/';
  vi.restoreAllMocks();
});
afterEach(() => {
  cleanup();
});

describe('GroupedNav / MoreNavMenu branches', () => {
  it('exposes the same component under both export names', () => {
    expect(MoreNavMenu).toBe(GroupedNav);
  });

  it('marks the Library link active on the exact home path only', () => {
    mockPathname = '/';
    renderWithProviders(<GroupedNav />, { locale: 'en' });
    const lib = screen.getByRole('link', { name: t.nav.library });
    expect(lib).toHaveAttribute('aria-current', 'page');
    // Search is not active on home.
    expect(screen.getByRole('link', { name: t.nav.search })).not.toHaveAttribute('aria-current');
  });

  it('does not mark Library active on a non-home path (exact matcher)', () => {
    mockPathname = '/search';
    renderWithProviders(<GroupedNav />, { locale: 'en' });
    expect(screen.getByRole('link', { name: t.nav.library })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: t.nav.search })).toHaveAttribute('aria-current', 'page');
  });

  it('marks a primary link active by prefix and strips query/hash before matching', () => {
    mockPathname = '/search/results?q=x#frag';
    renderWithProviders(<GroupedNav />, { locale: 'en' });
    expect(screen.getByRole('link', { name: t.nav.search })).toHaveAttribute('aria-current', 'page');
  });

  it('lights up the group trigger when a child route is active', () => {
    mockPathname = '/producers';
    renderWithProviders(<GroupedNav />, { locale: 'en' });
    // Browse group contains /producers, so its trigger reflects active styling.
    const browseTrigger = screen.getByRole('button', { name: t.nav.groupBrowse });
    expect(browseTrigger.className).toContain('text-accent');
    // Discover group is not active.
    const discoverTrigger = screen.getByRole('button', { name: t.nav.groupDiscover });
    expect(discoverTrigger.className).not.toContain('bg-accent/15');
  });

  it('opens a group dropdown, focuses the first item, and renders every child link', async () => {
    const u = userEvent.setup();
    renderWithProviders(<GroupedNav />, { locale: 'en' });
    const browseTrigger = screen.getByRole('button', { name: t.nav.groupBrowse });
    expect(browseTrigger).toHaveAttribute('aria-expanded', 'false');
    await u.click(browseTrigger);
    expect(browseTrigger).toHaveAttribute('aria-expanded', 'true');
    const menu = await screen.findByRole('menu', { name: t.nav.groupBrowse });
    expect(within(menu).getByRole('menuitem', { name: t.nav.producers })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: t.nav.tags })).toBeInTheDocument();
    await waitFor(() => expect(within(menu).getByRole('menuitem', { name: t.nav.producers })).toHaveFocus());
  });

  it('navigates dropdown items with arrow / Home / End keys', async () => {
    const u = userEvent.setup();
    renderWithProviders(<GroupedNav />, { locale: 'en' });
    await u.click(screen.getByRole('button', { name: t.nav.groupBrowse }));
    const menu = await screen.findByRole('menu', { name: t.nav.groupBrowse });
    const items = within(menu).getAllByRole('menuitem');

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    await waitFor(() => expect(items[1]).toHaveFocus());
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    await waitFor(() => expect(items[0]).toHaveFocus());
    // ArrowUp wraps to the last item.
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    await waitFor(() => expect(items[items.length - 1]).toHaveFocus());
    fireEvent.keyDown(window, { key: 'Home' });
    await waitFor(() => expect(items[0]).toHaveFocus());
    fireEvent.keyDown(window, { key: 'End' });
    await waitFor(() => expect(items[items.length - 1]).toHaveFocus());
    // ArrowDown from the last item wraps to the first.
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    await waitFor(() => expect(items[0]).toHaveFocus());
    // A non-navigation key is ignored.
    fireEvent.keyDown(window, { key: 'a' });
    expect(items[0]).toHaveFocus();
  });

  it('closes the dropdown on Escape and returns focus to the trigger', async () => {
    const u = userEvent.setup();
    renderWithProviders(<GroupedNav />, { locale: 'en' });
    const trigger = screen.getByRole('button', { name: t.nav.groupDiscover });
    await u.click(trigger);
    await screen.findByRole('menu', { name: t.nav.groupDiscover });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu', { name: t.nav.groupDiscover })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('closes the dropdown when clicking outside of it', async () => {
    const u = userEvent.setup();
    renderWithProviders(<GroupedNav />, { locale: 'en' });
    await u.click(screen.getByRole('button', { name: t.nav.groupInsights }));
    await screen.findByRole('menu', { name: t.nav.groupInsights });
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole('menu', { name: t.nav.groupInsights })).not.toBeInTheDocument());
  });

  it('closes the dropdown after selecting a menu item', async () => {
    const u = userEvent.setup();
    renderWithProviders(<GroupedNav />, { locale: 'en' });
    await u.click(screen.getByRole('button', { name: t.nav.groupBrowse }));
    const menu = await screen.findByRole('menu', { name: t.nav.groupBrowse });
    await u.click(within(menu).getByRole('menuitem', { name: t.nav.tags }));
    await waitFor(() => expect(screen.queryByRole('menu', { name: t.nav.groupBrowse })).not.toBeInTheDocument());
  });

  it('marks the active menu item with aria-current inside an open group', async () => {
    mockPathname = '/tags';
    const u = userEvent.setup();
    renderWithProviders(<GroupedNav />, { locale: 'en' });
    await u.click(screen.getByRole('button', { name: t.nav.groupBrowse }));
    const menu = await screen.findByRole('menu', { name: t.nav.groupBrowse });
    expect(within(menu).getByRole('menuitem', { name: t.nav.tags })).toHaveAttribute('aria-current', 'page');
    expect(within(menu).getByRole('menuitem', { name: t.nav.series })).not.toHaveAttribute('aria-current');
  });

  it('omits the AliceNet entry by default and includes it when enabled', async () => {
    const u = userEvent.setup();
    const { rerender } = renderWithProviders(<GroupedNav />, { locale: 'en' });
    await u.click(screen.getByRole('button', { name: t.nav.groupInsights }));
    let menu = await screen.findByRole('menu', { name: t.nav.groupInsights });
    expect(within(menu).queryByRole('menuitem', { name: t.nav.alicenet })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu', { name: t.nav.groupInsights })).not.toBeInTheDocument());

    rerender(<GroupedNav alicenetEnabled />);
    await u.click(screen.getByRole('button', { name: t.nav.groupInsights }));
    menu = await screen.findByRole('menu', { name: t.nav.groupInsights });
    expect(within(menu).getByRole('menuitem', { name: t.nav.alicenet })).toBeInTheDocument();
  });

  it('opens and closes the mobile sheet with grouped links', async () => {
    const u = userEvent.setup();
    renderWithProviders(<GroupedNav />, { locale: 'en' });
    const hamburger = screen.getByRole('button', { name: t.nav.openMenu });
    expect(hamburger).toHaveAttribute('aria-expanded', 'false');
    await u.click(hamburger);
    const dialog = await screen.findByRole('dialog');
    // Group headings and at least one link per group render in the sheet.
    expect(within(dialog).getByText(t.nav.groupPrimary)).toBeInTheDocument();
    expect(within(dialog).getByText(t.nav.groupInsights)).toBeInTheDocument();
    expect(within(dialog).getAllByRole('link', { name: t.nav.library }).length).toBeGreaterThan(0);
    // Close via the X button.
    await u.click(within(dialog).getByRole('button', { name: t.common.close }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes the mobile sheet when a link is chosen', async () => {
    const u = userEvent.setup();
    renderWithProviders(<GroupedNav />, { locale: 'en' });
    await u.click(screen.getByRole('button', { name: t.nav.openMenu }));
    const dialog = await screen.findByRole('dialog');
    await u.click(within(dialog).getAllByRole('link', { name: t.nav.library })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('treats every link as inactive when the pathname is null', () => {
    mockPathname = null;
    renderWithProviders(<GroupedNav />, { locale: 'en' });
    // isActive returns false for a null pathname, so no primary link is current.
    expect(screen.getByRole('link', { name: t.nav.library })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: t.nav.search })).not.toHaveAttribute('aria-current');
  });

  it('marks the active link inside the mobile sheet', async () => {
    mockPathname = '/wishlist';
    const u = userEvent.setup();
    renderWithProviders(<GroupedNav />, { locale: 'en' });
    await u.click(screen.getByRole('button', { name: t.nav.openMenu }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByRole('link', { name: t.nav.wishlist })[0]).toHaveAttribute('aria-current', 'page');
  });
});
