// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { EgsRichDetails } from '@/components/EgsRichDetails';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;
const EGS_URL = 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=31426';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * Build a full /api/vn/[id]/erogamescape snapshot whose `game.raw`
 * column map is overridable. Only the `raw` map drives EgsRichDetails.
 */
function snapshot(raw: Record<string, string | null> | null) {
  return {
    source: 'extlink',
    game: {
      id: 31426,
      gamename: 'Title Y',
      gamename_furigana: null,
      brand_id: null,
      brand_name: null,
      model: null,
      description: null,
      image_url: null,
      okazu: null,
      erogame: null,
      median: null,
      average: null,
      dispersion: null,
      count: null,
      sellday: null,
      playtime_median_minutes: null,
      url: EGS_URL,
      ...(raw === null ? {} : { raw }),
    },
  };
}

function mockFetchRaw(raw: Record<string, string | null> | null) {
  global.fetch = vi.fn(async () => json(snapshot(raw)));
}

describe('EgsRichDetails branches', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the loading skeleton before the fetch resolves', () => {
    let resolve!: (r: Response) => void;
    global.fetch = vi.fn(() => new Promise<Response>((r) => { resolve = r; }));
    const { container } = renderWithProviders(<EgsRichDetails vnId="v90001" />, { locale: 'en' });
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
    resolve(json(snapshot(null)));
  });

  it('renders nothing when the snapshot has no raw payload', async () => {
    mockFetchRaw(null);
    const { container } = renderWithProviders(<EgsRichDetails vnId="v90001" />, { locale: 'en' });
    await waitFor(() => expect(container.querySelector('.animate-pulse')).toBeNull());
    expect(container.querySelector('dl')).toBeNull();
  });

  it('renders nothing when raw exists but every renderable field is empty', async () => {
    mockFetchRaw({
      erogetrailers: '0',
      dmm: '',
      genre: '',
      hanbaisuu: '',
      axis_of_soft_or_hard: '',
      max2: '',
      min2: '',
      median2: '',
      time_before_understanding_fun_median: '',
      tourokubi: '',
    });
    const { container } = renderWithProviders(<EgsRichDetails vnId="v90001" />, { locale: 'en' });
    await waitFor(() => expect(container.querySelector('.animate-pulse')).toBeNull());
    expect(container.querySelector('dl')).toBeNull();
  });

  it('hides entirely when the fetch fails (non-ok response decodes to null)', async () => {
    global.fetch = vi.fn(async () => json({ error: 'boom' }, 500));
    const { container } = renderWithProviders(<EgsRichDetails vnId="v90001" />, { locale: 'en' });
    await waitFor(() => expect(container.querySelector('.animate-pulse')).toBeNull());
    expect(container.querySelector('dl')).toBeNull();
  });

  it('hides entirely when the fetch rejects (catch branch)', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network'); });
    const { container } = renderWithProviders(<EgsRichDetails vnId="v90001" />, { locale: 'en' });
    await waitFor(() => expect(container.querySelector('.animate-pulse')).toBeNull());
    expect(container.querySelector('dl')).toBeNull();
  });

  it('renders every external link, every stat, and the POV breakdown', async () => {
    mockFetchRaw({
      erogetrailers: '777',
      trial_url: 'https://example.com/demo',
      dmm: 'abc123',
      dlsite_id: 'RJ12345',
      dlsite_domain: 'maniax',
      gyutto_id: '9090',
      twitter: '@studio_x',
      genre: 'Comedy',
      axis_of_soft_or_hard: '3.2',
      max2: '95',
      min2: '40',
      median2: '80',
      hanbaisuu: '12345',
      time_before_understanding_fun_median: '2',
      total_pov_enrollment_of_a: '5',
      total_pov_enrollment_of_b: '3',
      total_pov_enrollment_of_c: '2',
      tourokubi: '2020-04-01',
    });
    renderWithProviders(<EgsRichDetails vnId="v90001" />, { locale: 'en' });

    expect(await screen.findByText('EroGameTrailers')).toBeInTheDocument();
    expect(screen.getByText(t.egsRich.demo)).toBeInTheDocument();
    expect(screen.getByText('DMM')).toBeInTheDocument();
    expect(screen.getByText('DLsite')).toBeInTheDocument();
    expect(screen.getByText('Gyutto')).toBeInTheDocument();
    expect(screen.getByText('Twitter')).toBeInTheDocument();

    const trailerLink = screen.getByText('EroGameTrailers').closest('a');
    expect(trailerLink).toHaveAttribute('href', 'https://erogetrailers.com/movie/777');
    const dmmLink = screen.getByText('DMM').closest('a');
    expect(dmmLink).toHaveAttribute('href', 'https://dlsoft.dmm.co.jp/detail/abc123/');
    const dlsiteLink = screen.getByText('DLsite').closest('a');
    expect(dlsiteLink).toHaveAttribute('href', 'https://www.dlsite.com/maniax/work/=/product_id/RJ12345.html');
    const gyuttoLink = screen.getByText('Gyutto').closest('a');
    expect(gyuttoLink).toHaveAttribute('href', 'https://gyutto.com/i/item9090');
    // The leading @ is stripped from the twitter handle.
    const twitterLink = screen.getByText('Twitter').closest('a');
    expect(twitterLink).toHaveAttribute('href', 'https://twitter.com/studio_x');

    expect(screen.getByText(t.egsRich.genre)).toBeInTheDocument();
    expect(screen.getByText('Comedy')).toBeInTheDocument();
    expect(screen.getByText(t.egsRich.softHard)).toBeInTheDocument();
    expect(screen.getByText('3.2 / 5')).toBeInTheDocument();
    expect(screen.getByText(t.egsRich.scoreRange)).toBeInTheDocument();
    expect(screen.getByText('40 - 95 / ~80')).toBeInTheDocument();
    expect(screen.getByText(t.egsRich.timeToFun)).toBeInTheDocument();
    expect(screen.getByText(t.egsRich.salesRank)).toBeInTheDocument();
    expect(screen.getByText(t.egsRich.registered)).toBeInTheDocument();
    expect(screen.getByText('2020-04-01')).toBeInTheDocument();

    // POV breakdown panel rendered with the three bars (A/B/C).
    expect(screen.getByText(t.egsRich.povBreakdown)).toBeInTheDocument();
    expect(screen.getByText(t.egsRich.povLabelA)).toBeInTheDocument();
    expect(screen.getByText(t.egsRich.povLabelB)).toBeInTheDocument();
    expect(screen.getByText(t.egsRich.povLabelC)).toBeInTheDocument();
    // 5 of 10 total -> 50% for the A bucket.
    expect(screen.getByText('(50%)')).toBeInTheDocument();
  });

  it('drops links with unsafe schemes via safeHref while keeping safe ones', async () => {
    mockFetchRaw({
      trial_url: 'javascript:alert(1)',
      dmm: 'safe',
      genre: 'Drama',
    });
    renderWithProviders(<EgsRichDetails vnId="v90001" />, { locale: 'en' });
    // DMM link survives; the unsafe demo trial_url is filtered out.
    expect(await screen.findByText('DMM')).toBeInTheDocument();
    expect(screen.queryByText(t.egsRich.demo)).toBeNull();
  });

  it('renders the score range with question marks when only the median is present', async () => {
    mockFetchRaw({ median2: '70' });
    renderWithProviders(<EgsRichDetails vnId="v90001" />, { locale: 'en' });
    expect(await screen.findByText('? - ? / ~70')).toBeInTheDocument();
  });

  it('renders the score range without the median suffix when median2 is absent', async () => {
    mockFetchRaw({ min2: '10', max2: '50' });
    renderWithProviders(<EgsRichDetails vnId="v90001" />, { locale: 'en' });
    expect(await screen.findByText('10 - 50')).toBeInTheDocument();
  });

  it('falls back to zero for a missing POV bucket while others are populated', async () => {
    // total_pov_enrollment_of_a omitted -> povA is null -> the `?? 0`
    // fallback feeds 0 into the A bar while B/C keep the total positive.
    mockFetchRaw({
      total_pov_enrollment_of_b: '7',
      total_pov_enrollment_of_c: '3',
    });
    renderWithProviders(<EgsRichDetails vnId="v90001" />, { locale: 'en' });
    expect(await screen.findByText(t.egsRich.povBreakdown)).toBeInTheDocument();
    // A bucket renders 0 (0%); B is 7 of 10 (70%).
    expect(screen.getByText('(0%)')).toBeInTheDocument();
    expect(screen.getByText('(70%)')).toBeInTheDocument();
  });

  it('keeps the POV panel hidden when the enrollment total is zero', async () => {
    mockFetchRaw({
      genre: 'Mystery',
      total_pov_enrollment_of_a: '0',
      total_pov_enrollment_of_b: '0',
      total_pov_enrollment_of_c: '0',
    });
    renderWithProviders(<EgsRichDetails vnId="v90001" />, { locale: 'en' });
    expect(await screen.findByText('Mystery')).toBeInTheDocument();
    expect(screen.queryByText(t.egsRich.povBreakdown)).toBeNull();
  });
});
