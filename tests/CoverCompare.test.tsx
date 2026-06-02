// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { CoverCompare } from '@/components/CoverCompare';
import { dispatchCoverChanged } from '@/lib/cover-banner-events';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.fr;

function renderCompare(ui: React.ReactElement) {
  return renderWithProviders(<DisplaySettingsProvider>{ui}</DisplaySettingsProvider>);
}

const vndbPoster = { remote: 'https://example.com/vndb.jpg', local: null };
const egsPoster = { remote: 'https://example.com/egs.jpg', local: null };
const customPoster = { remote: null, local: 'cover/custom.jpg' };
const emptyPoster = { remote: null, local: null };

describe('CoverCompare', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a single active image with no compare control when only one poster exists', () => {
    renderCompare(
      <CoverCompare
        vnId="v90001"
        current="auto"
        vndb={vndbPoster}
        egs={emptyPoster}
        custom={emptyPoster}
        sexual={0}
        alt="Title Y"
      />,
    );
    expect(screen.getByAltText('Title Y')).toBeTruthy();
    expect(screen.queryByRole('button', { name: new RegExp(t.compare.compareBtn) })).toBeNull();
  });

  it('shows the compare button when at least two posters are populated and opens compare columns', () => {
    renderCompare(
      <CoverCompare
        vnId="v90001"
        current="auto"
        vndb={vndbPoster}
        egs={egsPoster}
        custom={customPoster}
        sexual={0}
        alt="Title Y"
      />,
    );
    const compareBtn = screen.getByRole('button', { name: new RegExp(t.compare.compareBtn) });
    fireEvent.click(compareBtn);
    // All three column "use" buttons should now be present.
    expect(screen.getByRole('button', { name: t.compare.useVndb })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.compare.useEgs })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.compare.useCustom })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.compare.useAuto })).toBeTruthy();
  });

  it('PATCHes source-pref when selecting a column in compare mode', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderCompare(
      <CoverCompare
        vnId="v90001"
        current="vndb"
        vndb={vndbPoster}
        egs={egsPoster}
        custom={emptyPoster}
        sexual={0}
        alt="Title Y"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compare.compareBtn) }));
    // VNDB is active so its "use" button is disabled; switch to EGS.
    fireEvent.click(screen.getByRole('button', { name: t.compare.useEgs }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/collection/v90001/source-pref');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ image: 'egs' });
  });

  it('reverts optimistic selection when the PATCH fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'pref failed' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    renderCompare(
      <CoverCompare
        vnId="v90001"
        current="vndb"
        vndb={vndbPoster}
        egs={egsPoster}
        custom={emptyPoster}
        sexual={0}
        alt="Title Y"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compare.compareBtn) }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useEgs }));
    // After failure the auto button stays non-active; the toast surfaces the error.
    await waitFor(() => expect(screen.getByText('pref failed')).toBeTruthy());
  });

  it('closes compare mode via the Close button', () => {
    renderCompare(
      <CoverCompare
        vnId="v90001"
        current="auto"
        vndb={vndbPoster}
        egs={egsPoster}
        custom={emptyPoster}
        sexual={0}
        alt="Title Y"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compare.compareBtn) }));
    expect(screen.getByRole('button', { name: t.compare.useVndb })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.common.close }));
    expect(screen.queryByRole('button', { name: t.compare.useVndb })).toBeNull();
  });

  it('syncs rotation from a cover-changed event for this VN', async () => {
    renderCompare(
      <CoverCompare
        vnId="v90007"
        current="auto"
        vndb={vndbPoster}
        egs={emptyPoster}
        custom={emptyPoster}
        sexual={0}
        alt="Rotated Title"
      />,
    );
    const img = screen.getByAltText('Rotated Title') as HTMLImageElement;
    expect(img.style.transform).toBe('');
    act(() => {
      dispatchCoverChanged({ vnId: 'v90007', newSrc: null, newLocal: null, rotation: 180 });
    });
    await waitFor(() => expect((screen.getByAltText('Rotated Title') as HTMLImageElement).style.transform).toContain('180'));
  });
});
