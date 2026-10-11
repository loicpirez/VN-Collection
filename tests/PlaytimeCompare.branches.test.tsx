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
  const aiEstimate = {
    minutes: 720,
    lower_minutes: 600,
    upper_minutes: 840,
    confidence: 0.8,
    model: 'local-estimator-v1',
    rationale: 'Metadata-based estimate.',
    generated_at: 1_700_000_000_000,
  };

  it('keeps the comparison and AI editor reachable when only one source is populated', () => {
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="auto" vndb={600} egs={null} mine={null} />,
      { locale: 'en' },
    );
    expect(screen.getByRole('button', { name: t.compare.compareBtn })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    expect(screen.getByText(t.playtime.aiEstimateTitle)).toBeInTheDocument();
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
    expect(screen.getAllByText(t.playtime.vndb)).toHaveLength(2);
  });

  it('honors an explicit EGS preference in the collapsed headline', () => {
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="egs" vndb={600} egs={900} mine={300} />,
      { locale: 'en' },
    );
    expect(screen.getAllByText(t.playtime.egs)).toHaveLength(2);
  });

  it('honors an explicit custom preference resolving to the mine column', () => {
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="custom" vndb={null} egs={null} mine={300} />,
      { locale: 'en' },
    );
    // pref custom && mineHas -> mine column wins as the active tab.
    expect(screen.getAllByText(t.playtime.mine)).toHaveLength(2);
  });

  it('falls back to the mine column when no source is populated', () => {
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="auto" vndb={null} egs={0} mine={-5} />,
      { locale: 'en' },
    );
    // combinedHas false, vndbHas false, egsHas false -> returns 'mine'.
    expect(screen.getAllByText(t.playtime.mine)).toHaveLength(2);
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
    fireEvent.click(screen.getByRole('button', { name: t.playtime.useMedian }));
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

  it('includes AI automatically in the median without a Use AI action', () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="auto" vndb={600} egs={900} mine={300} ai={aiEstimate} />,
      { locale: 'en' },
    );
    expect(screen.getByText('11h')).toBeInTheDocument();
    expect(screen.getByText(t.playtime.ai)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.playtime.aiEstimateTitle })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    expect(screen.queryByRole('button', { name: t.playtime.useAi })).not.toBeInTheDocument();
  });

  it('saves a bounded AI estimate without writing the personal playtime field', async () => {
    const saved = { ...aiEstimate, generated_at: 1_700_000_000_001 };
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ estimate: saved }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    renderWithProviders(
      <PlaytimeCompare vnId="v90001" current="auto" vndb={600} egs={900} mine={300} />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    fireEvent.change(screen.getByLabelText(t.playtime.aiHours), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(t.playtime.aiLowerHours), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(t.playtime.aiUpperHours), { target: { value: '14' } });
    fireEvent.change(screen.getByLabelText(t.playtime.aiConfidence), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText(t.playtime.aiModel), { target: { value: 'local-estimator-v1' } });
    fireEvent.change(screen.getByLabelText(t.playtime.aiRationale), { target: { value: 'Metadata-based estimate.' } });
    fireEvent.click(screen.getByRole('button', { name: t.playtime.aiSave }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/collection/v90001/ai-playtime');
      expect(call![1].method).toBe('PUT');
      expect(JSON.parse(call![1].body)).toEqual({
        minutes: 720,
        lower_minutes: 600,
        upper_minutes: 840,
        confidence: 0.8,
        model: 'local-estimator-v1',
        rationale: 'Metadata-based estimate.',
      });
      expect(JSON.parse(call![1].body)).not.toHaveProperty('playtime_minutes');
    });
  });

  it.each([
    ['central absent', 'aiHours', ''],
    ['central zero', 'aiHours', '0'],
    ['central negative', 'aiHours', '-1'],
    ['central unsafe', 'aiHours', '1e100'],
    ['central beyond cap', 'aiHours', '200000'],
    ['central rounds to zero', 'aiHours', '0.001'],
    ['lower absent', 'aiLowerHours', ''],
    ['upper absent', 'aiUpperHours', ''],
    ['lower above central', 'aiLowerHours', '13'],
    ['upper below central', 'aiUpperHours', '11'],
    ['model blank', 'aiModel', '   '],
    ['confidence above maximum', 'aiConfidence', '101'],
    ['confidence negative', 'aiConfidence', '-1'],
  ] as const)('rejects an invalid AI form: %s', async (_name, field, value) => {
    renderWithProviders(<PlaytimeCompare vnId="v90001" current="auto" vndb={600} egs={null} mine={null} ai={aiEstimate} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.playtime.aiEstimateTitle }));
    fireEvent.change(screen.getByLabelText(t.playtime[field]), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: t.playtime.aiSave }));
    expect(await screen.findByText(t.playtime.aiInvalid)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('saves nullable optional provenance and fractional hours without activating AI', async () => {
    const saved = { ...aiEstimate, confidence: null, rationale: null, minutes: 750 };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ estimate: saved })));
    renderWithProviders(<PlaytimeCompare vnId="v90001" current="auto" vndb={600} egs={900} mine={300} ai={{ ...aiEstimate, confidence: null, rationale: null }} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.playtime.aiEstimateTitle }));
    fireEvent.change(screen.getByLabelText(t.playtime.aiHours), { target: { value: '12.5' } });
    fireEvent.click(screen.getByRole('button', { name: t.playtime.aiSave }));
    await screen.findByText(t.toast.saved);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/collection/v90001/ai-playtime', expect.objectContaining({
      body: JSON.stringify({ minutes: 750, lower_minutes: 600, upper_minutes: 840, confidence: null, model: aiEstimate.model, rationale: null }),
    }));
    fireEvent.click(screen.getByRole('button', { name: t.common.close }));
    expect(screen.getByText('11h 15min')).toBeInTheDocument();
  });

  it.each(['HTTP', 'missing estimate', 'network'])('reports an AI save failure: %s', async (failure) => {
    if (failure === 'HTTP') vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'AI save failed' }), { status: 500 }));
    else if (failure === 'missing estimate') vi.mocked(fetch).mockResolvedValueOnce(ok());
    else vi.mocked(fetch).mockRejectedValueOnce(new Error('AI network failed'));
    renderWithProviders(<PlaytimeCompare vnId="v90001" current="auto" vndb={600} egs={null} mine={null} ai={aiEstimate} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.playtime.aiEstimateTitle }));
    fireEvent.click(screen.getByRole('button', { name: t.playtime.aiSave }));
    await screen.findByText(failure === 'HTTP' ? 'AI save failed' : failure === 'network' ? 'AI network failed' : t.common.error);
    expect(screen.getByRole('button', { name: t.playtime.aiSave })).toBeEnabled();
  });

  it('clears AI and falls back from a legacy AI pin to the remaining-source median', async () => {
    renderWithProviders(<PlaytimeCompare vnId="v90001" current="ai" vndb={600} egs={900} mine={null} ai={aiEstimate} />, { locale: 'en' });
    expect(screen.getAllByText(t.playtime.ai)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: t.playtime.aiEstimateTitle }));
    fireEvent.click(screen.getByRole('button', { name: t.playtime.aiClear }));
    await screen.findByText(t.playtime.aiCleared);
    expect(fetch).toHaveBeenCalledWith('/api/collection/v90001/ai-playtime', expect.objectContaining({ method: 'DELETE' }));
    expect(screen.getByRole('button', { name: t.playtime.aiClear })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: t.common.close }));
    expect(screen.getByText('12h 30min')).toBeInTheDocument();
  });

  it.each(['HTTP', 'network'])('keeps the estimate when AI clearing fails: %s', async (failure) => {
    if (failure === 'HTTP') vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'AI clear failed' }), { status: 500 }));
    else vi.mocked(fetch).mockRejectedValueOnce(new Error('AI clear failed'));
    renderWithProviders(<PlaytimeCompare vnId="v90001" current="auto" vndb={600} egs={null} mine={null} ai={aiEstimate} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.playtime.aiEstimateTitle }));
    fireEvent.click(screen.getByRole('button', { name: t.playtime.aiClear }));
    await screen.findByText('AI clear failed');
    expect(screen.getByRole('button', { name: t.playtime.aiClear })).toBeEnabled();
  });

  it.each(['save', 'clear'])('synchronously deduplicates an AI %s against another mutation', async (mutation) => {
    let resolveResponse: (response: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    renderWithProviders(<PlaytimeCompare vnId="v90001" current="auto" vndb={600} egs={null} mine={null} ai={aiEstimate} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.playtime.aiEstimateTitle }));
    const save = screen.getByRole('button', { name: t.playtime.aiSave });
    const clear = screen.getByRole('button', { name: t.playtime.aiClear });
    act(() => {
      (mutation === 'save' ? save : clear).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      clear.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => resolveResponse(new Response(JSON.stringify({ estimate: aiEstimate }))));
    await screen.findByText(mutation === 'save' ? t.toast.saved : t.playtime.aiCleared);
  });

  it.each([
    ['save', 'success'], ['save', 'failure'], ['clear', 'success'], ['clear', 'failure'],
  ] as const)('aborts and discards late AI %s %s after navigating to another VN', async (mutation, result) => {
    let resolveResponse: (response: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    const mounted = renderWithProviders(<PlaytimeCompare vnId="v90001" current="auto" vndb={600} egs={null} mine={null} ai={aiEstimate} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.playtime.aiEstimateTitle }));
    fireEvent.click(screen.getByRole('button', { name: mutation === 'save' ? t.playtime.aiSave : t.playtime.aiClear }));
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    mounted.rerender(<PlaytimeCompare vnId="v90002" current="auto" vndb={1200} egs={null} mine={null} />);
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      resolveResponse(new Response(JSON.stringify(result === 'success' ? { estimate: aiEstimate } : { error: 'late AI failure' }), { status: result === 'success' ? 200 : 500 }));
    });
    expect(screen.queryByText(t.toast.saved)).not.toBeInTheDocument();
    expect(screen.queryByText(t.playtime.aiCleared)).not.toBeInTheDocument();
    expect(screen.queryByText('late AI failure')).not.toBeInTheDocument();
    expect(screen.getAllByText('20h')).toHaveLength(2);
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
    const autoButton = screen.getByRole('button', { name: t.playtime.useMedian });
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
