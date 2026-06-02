// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { CompareWithButton } from '@/components/CompareWithButton';
import { dictionaries } from '@/lib/i18n/dictionaries';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.fr;

function compareRow(id: string, title: string, released: string | null = '2018-01-01') {
  return { id, title, alttitle: null, released };
}

function collectionPage(items: ReturnType<typeof compareRow>[]) {
  return {
    items,
    pagination: { page: 1, page_size: 500, returned: items.length, has_more: false },
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

describe('CompareWithButton', () => {
  beforeEach(() => {
    pushMock.mockClear();
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(collectionPage([
        compareRow('v90001', 'Title Y', '2018-05-01'),
        compareRow('v90002', 'Title Z', '2020-09-01'),
        compareRow('v90003', 'Other VN', null),
      ])));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the trigger button and keeps the dialog closed initially', () => {
    renderWithProviders(<CompareWithButton currentVnId="v90099" />);
    expect(screen.getByRole('button', { name: new RegExp(t.compareWith.cta) })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('applies the data-menu-keep-open attribute when keepMenuOpen is set', () => {
    renderWithProviders(<CompareWithButton currentVnId="v90099" keepMenuOpen triggerClassName="custom-trigger" />);
    const btn = screen.getByRole('button', { name: new RegExp(t.compareWith.cta) });
    expect(btn.getAttribute('data-menu-keep-open')).toBe('');
    expect(btn.className).toContain('custom-trigger');
  });

  it('opens the dialog and loads the collection rows excluding the current VN', async () => {
    renderWithProviders(<CompareWithButton currentVnId="v90099" />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compareWith.cta) }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Title Y/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Title Z/ })).toBeTruthy();
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain('/api/collection?');
    expect(String(url)).toContain('sort=released');
  });

  it('toggles selection up to three rows and updates the hint count', async () => {
    renderWithProviders(<CompareWithButton currentVnId="v90099" />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compareWith.cta) }));
    const rowY = await screen.findByRole('button', { name: /Title Y/ });
    fireEvent.click(rowY);
    expect(rowY.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(rowY);
    expect(rowY.getAttribute('aria-pressed')).toBe('false');
  });

  it('navigates to /compare with the picked ids when Compare is clicked', async () => {
    renderWithProviders(<CompareWithButton currentVnId="v90099" />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compareWith.cta) }));
    fireEvent.click(await screen.findByRole('button', { name: /Title Y/ }));
    fireEvent.click(screen.getByRole('button', { name: /Title Z/ }));
    const dialog = screen.getByRole('dialog');
    const goButton = within(dialog).getByRole('button', { name: t.compareWith.go.replace('{n}', '3') });
    fireEvent.click(goButton);
    expect(pushMock).toHaveBeenCalledWith('/compare?ids=v90099%2Cv90001%2Cv90002');
  });

  it('keeps the Compare action disabled and inert with no selection', async () => {
    renderWithProviders(<CompareWithButton currentVnId="v90099" />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compareWith.cta) }));
    await screen.findByRole('button', { name: /Title Y/ });
    const dialog = screen.getByRole('dialog');
    const goButton = within(dialog).getByRole('button', { name: t.compareWith.go.replace('{n}', '1') });
    expect((goButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(goButton);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('filters rows by the search input', async () => {
    renderWithProviders(<CompareWithButton currentVnId="v90099" />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compareWith.cta) }));
    await screen.findByRole('button', { name: /Title Y/ });
    const filter = screen.getByPlaceholderText(t.compareWith.searchPlaceholder);
    fireEvent.change(filter, { target: { value: 'Other' } });
    expect(screen.getByRole('button', { name: /Other VN/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Title Y/ })).toBeNull();
  });

  it('shows the empty copy when the filter matches nothing', async () => {
    renderWithProviders(<CompareWithButton currentVnId="v90099" />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compareWith.cta) }));
    await screen.findByRole('button', { name: /Title Y/ });
    const filter = screen.getByPlaceholderText(t.compareWith.searchPlaceholder);
    fireEvent.change(filter, { target: { value: 'zzzznotfound' } });
    expect(screen.getByText(t.compareWith.empty)).toBeTruthy();
  });

  it('closes via the cancel button', async () => {
    renderWithProviders(<CompareWithButton currentVnId="v90099" />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compareWith.cta) }));
    await screen.findByRole('button', { name: /Title Y/ });
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.cancel }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('renders the empty state when the collection has no other VNs', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(collectionPage([])));
    renderWithProviders(<CompareWithButton currentVnId="v90099" />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compareWith.cta) }));
    await waitFor(() => expect(screen.getByText(t.compareWith.empty)).toBeTruthy());
  });

  it('handles a failed collection fetch without crashing', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ error: 'boom' }, 500));
    renderWithProviders(<CompareWithButton currentVnId="v90099" />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compareWith.cta) }));
    await waitFor(() => expect(screen.getByText(t.compareWith.empty)).toBeTruthy());
    expect(pushMock).not.toHaveBeenCalled();
  });
});
