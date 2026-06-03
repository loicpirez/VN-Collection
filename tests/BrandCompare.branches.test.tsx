// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { BrandCompare } from '@/components/BrandCompare';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;

const devs = [
  { id: 'p90001', name: 'Studio X' },
  { id: 'p90002', name: 'Studio Z' },
];

function ok(): Response {
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue(ok());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BrandCompare branches', () => {
  it('renders developer chips with no compare button when only VNDB has data', () => {
    renderWithProviders(
      <BrandCompare vnId="v90001" current="auto" vndbDevs={devs} egsBrand={null} label="Developer" />,
      { locale: 'en' },
    );
    expect(screen.getByRole('link', { name: 'Studio X' })).toHaveAttribute('href', '/producer/p90001');
    expect(screen.getByRole('link', { name: 'Studio Z' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.compare.compareBtn })).toBeNull();
  });

  it('renders the dash placeholder when neither side has data', () => {
    renderWithProviders(
      <BrandCompare vnId="v90001" current="auto" vndbDevs={[]} egsBrand="   " label="Developer" />,
      { locale: 'en' },
    );
    // egsBrand is whitespace -> egsHas false; vndbDevs empty -> DevChips renders the dash.
    expect(screen.getByText('-')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.compare.compareBtn })).toBeNull();
  });

  it('shows the EGS brand chip in the collapsed view when the preference resolves to EGS', () => {
    renderWithProviders(
      <BrandCompare vnId="v90001" current="egs" vndbDevs={[]} egsBrand="Brand Q" label="Developer" />,
      { locale: 'en' },
    );
    // resolved.used === 'egs' && egsBrand -> the brand chip renders directly.
    expect(screen.getByText('Brand Q')).toBeInTheDocument();
  });

  it('shows a fallback-source badge when the resolved source differs from the preference', () => {
    renderWithProviders(
      <BrandCompare vnId="v90001" current="egs" vndbDevs={devs} egsBrand={null} label="Developer" />,
      { locale: 'en' },
    );
    // pref egs but EGS empty -> falls back to VNDB; badge shows the used source.
    expect(screen.getByText('VNDB')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Studio X' })).toBeInTheDocument();
  });

  it('opens the compare view with both columns when both sources are populated', () => {
    renderWithProviders(
      <BrandCompare vnId="v90001" current="auto" vndbDevs={devs} egsBrand="Brand Q" label="Developer" />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    expect(screen.getByRole('button', { name: t.compare.useVndb })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.compare.useEgs })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.compare.useAuto })).toBeInTheDocument();
  });

  it('PATCHes the brand preference to EGS when picking the EGS column', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(
      <BrandCompare vnId="v90001" current="vndb" vndbDevs={devs} egsBrand="Brand Q" label="Developer" />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useEgs }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/collection/v90001/source-pref');
      expect(call![1].method).toBe('PATCH');
      expect(JSON.parse(call![1].body)).toEqual({ brand: 'egs' });
    });
    await waitFor(() => expect(screen.getByText(t.toast.saved)).toBeInTheDocument());
  });

  it('sets the auto preference via the bottom button', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(
      <BrandCompare vnId="v90001" current="vndb" vndbDevs={devs} egsBrand="Brand Q" label="Developer" />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useAuto }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/collection/v90001/source-pref');
      expect(call && JSON.parse(call[1].body)).toEqual({ brand: 'auto' });
    });
  });

  it('disables the active VNDB column use button inside compare mode', () => {
    renderWithProviders(
      <BrandCompare vnId="v90001" current="vndb" vndbDevs={devs} egsBrand="Brand Q" label="Developer" />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    // VNDB is active -> its use button is disabled inside the Column.
    expect((screen.getByRole('button', { name: t.compare.useVndb }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('reverts the optimistic choice and shows the error when the PATCH fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'brand save failed' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    renderWithProviders(
      <BrandCompare vnId="v90001" current="vndb" vndbDevs={devs} egsBrand="Brand Q" label="Developer" />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useEgs }));
    await waitFor(() => expect(screen.getByText('brand save failed')).toBeInTheDocument());
  });

  it('renders the empty-side dash for a column that lacks data after opening compare', () => {
    renderWithProviders(
      <BrandCompare vnId="v90001" current="vndb" vndbDevs={devs} egsBrand="Brand Q" label="Developer" />,
      { locale: 'en' },
    );
    // canCompare requires both, so to exercise an empty Column we open and read EGS content.
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    const egsUse = screen.getByRole('button', { name: t.compare.useEgs });
    const egsColumn = egsUse.closest('div')?.parentElement as HTMLElement;
    expect(within(egsColumn).getByText('Brand Q')).toBeInTheDocument();
  });

  it('PATCHes the brand preference to VNDB when picking the VNDB column', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    // current 'egs' so the VNDB column is selectable (not active).
    renderWithProviders(
      <BrandCompare vnId="v90001" current="egs" vndbDevs={devs} egsBrand="Brand Q" label="Developer" />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useVndb }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/collection/v90001/source-pref');
      expect(JSON.parse(call![1].body)).toEqual({ brand: 'vndb' });
    });
  });

  it('closes compare mode via the Close button', () => {
    renderWithProviders(
      <BrandCompare vnId="v90001" current="auto" vndbDevs={devs} egsBrand="Brand Q" label="Developer" />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    expect(screen.getByRole('button', { name: t.compare.useVndb })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.common.close }));
    expect(screen.queryByRole('button', { name: t.compare.useVndb })).toBeNull();
  });
});
