// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { PlaytimeCompare } from '@/components/PlaytimeCompare';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;

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

describe('PlaytimeCompare branches', () => {
  it('shows a single source with no compare button when only one source is populated', () => {
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="auto" vndb={600} egs={null} mine={null} />,
      { locale: 'en' },
    );
    // Only VNDB has a value -> populated < 2 and no combined+mine pairing.
    expect(screen.queryByRole('button', { name: t.compare.compareBtn })).toBeNull();
  });

  it('resolves the combined column by default when several sources exist', () => {
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="auto" vndb={600} egs={900} mine={null} />,
      { locale: 'en' },
    );
    // Collapsed view shows the Combined label and the averaged value.
    expect(screen.getByText(t.playtime.combined)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.compare.compareBtn })).toBeInTheDocument();
  });

  it('honors an explicit VNDB preference in the collapsed headline', () => {
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="vndb" vndb={600} egs={900} mine={300} />,
      { locale: 'en' },
    );
    // pref==='vndb' && vndbHas -> active tab is the VNDB label.
    expect(screen.getByText(t.playtime.vndb)).toBeInTheDocument();
  });

  it('honors an explicit EGS preference in the collapsed headline', () => {
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="egs" vndb={600} egs={900} mine={300} />,
      { locale: 'en' },
    );
    expect(screen.getByText(t.playtime.egs)).toBeInTheDocument();
  });

  it('honors an explicit custom preference resolving to the mine column', () => {
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="custom" vndb={null} egs={null} mine={300} />,
      { locale: 'en' },
    );
    // pref custom && mineHas -> mine column wins as the active tab.
    expect(screen.getByText(t.playtime.mine)).toBeInTheDocument();
  });

  it('falls back to the mine column when no source is populated', () => {
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="auto" vndb={null} egs={0} mine={-5} />,
      { locale: 'en' },
    );
    // combinedHas false, vndbHas false, egsHas false -> returns 'mine'.
    expect(screen.getByText(t.playtime.mine)).toBeInTheDocument();
  });

  it('enables compare when combined + mine are both present even with one raw source', () => {
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="auto" vndb={null} egs={null} mine={300} />,
      { locale: 'en' },
    );
    // populated === 1 but combinedHas (mine) && mineHas -> canCompare true.
    expect(screen.getByRole('button', { name: t.compare.compareBtn })).toBeInTheDocument();
  });

  it('opens compare mode, disables the empty + active use buttons, and closes again', () => {
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="vndb" vndb={600} egs={900} mine={null} />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    // Mine column is empty -> its use button is disabled.
    const useMine = screen.getByRole('button', { name: t.compare.useCustom }) as HTMLButtonElement;
    expect(useMine.disabled).toBe(true);
    // VNDB is the active column with a non-auto pref -> its use button is disabled.
    const useVndb = screen.getByRole('button', { name: t.compare.useVndb }) as HTMLButtonElement;
    expect(useVndb.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: t.common.close }));
    expect(screen.queryByRole('button', { name: t.compare.useVndb })).toBeNull();
  });

  it('PATCHes the playtime preference when picking the EGS column', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="vndb" vndb={600} egs={900} mine={300} />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useEgs }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/collection/v90001/source-pref');
    expect(call![1].method).toBe('PATCH');
    expect(JSON.parse(call![1].body)).toEqual({ playtime: 'egs' });
    await waitFor(() => expect(screen.getByText(t.toast.saved)).toBeInTheDocument());
  });

  it('maps the combined column to the auto preference', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="vndb" vndb={600} egs={900} mine={300} />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useAuto }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/collection/v90001/source-pref');
      expect(call && JSON.parse(call[1].body)).toEqual({ playtime: 'auto' });
    });
  });

  it('reverts the optimistic preference and surfaces an error when the PATCH fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'playtime save failed' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="vndb" vndb={600} egs={900} mine={300} />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useEgs }));
    await waitFor(() => expect(screen.getByText('playtime save failed')).toBeInTheDocument());
  });

  it('maps the VNDB column to the vndb preference and the mine column to custom', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    // current 'egs' so VNDB and Mine columns are both selectable (not active).
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="egs" vndb={600} egs={900} mine={300} />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useVndb }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/collection/v90001/source-pref');
      expect(JSON.parse(call![1].body)).toEqual({ playtime: 'vndb' });
    });
  });

  it('maps the mine column to the custom preference', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="egs" vndb={600} egs={900} mine={300} />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useCustom }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/collection/v90001/source-pref');
      expect(JSON.parse(call![1].body)).toEqual({ playtime: 'custom' });
    });
  });

  it('ignores a second persist call while one mutation is already in flight', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchMock = vi.fn(
      () => new Promise<Response>((res) => { resolveFetch = res; }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="vndb" vndb={600} egs={900} mine={300} />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    const egsButton = screen.getByRole('button', { name: t.compare.useEgs });
    const autoButton = screen.getByRole('button', { name: t.compare.useAuto });
    act(() => {
      egsButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      autoButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(ok());
    await waitFor(() => expect(screen.getByText(t.toast.saved)).toBeInTheDocument());
  });

  it('drops a successful persist after the VN identity changes', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    const { rerender } = renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="vndb" vndb={600} egs={900} mine={300} />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useEgs }));
    rerender(<PlaytimeCompare vnId="v90002" current="vndb" vndb={600} egs={900} mine={300} />);

    await act(async () => {
      resolveFetch(ok());
      await Promise.resolve();
    });

    expect(screen.queryByText(t.toast.saved)).toBeNull();
  });

  it('drops a failed persist after the VN identity changes', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    const { rerender } = renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="vndb" vndb={600} egs={900} mine={300} />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useEgs }));
    rerender(<PlaytimeCompare vnId="v90002" current="vndb" vndb={600} egs={900} mine={300} />);

    await act(async () => {
      resolveFetch(new Response(JSON.stringify({ error: 'late playtime failure' }), { status: 500, headers: { 'content-type': 'application/json' } }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText('late playtime failure')).toBeNull();
  });
});
