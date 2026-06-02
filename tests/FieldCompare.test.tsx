// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { FieldCompare } from '@/components/FieldCompare';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.fr;

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

describe('FieldCompare', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders only the VNDB body when EGS is empty and not linked (no compare control)', () => {
    renderWithProviders(
      <FieldCompare vnId="v90001" field="description" current="auto" vndb="Synopsis from VNDB" egs={null} label="Synopsis" />,
    );
    expect(screen.getByText('Synopsis from VNDB')).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.compare.compareBtn })).toBeNull();
  });

  it('shows the compare tabs when both sides are populated', () => {
    renderWithProviders(
      <FieldCompare vnId="v90001" field="description" current="auto" vndb="VNDB text" egs="EGS text" label="Synopsis" />,
    );
    expect(screen.getByRole('tablist', { name: 'Synopsis' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'VNDB' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'EGS' })).toBeTruthy();
    expect(screen.getByText('VNDB text')).toBeTruthy();
  });

  it('switches the displayed body when clicking the EGS tab', () => {
    renderWithProviders(
      <FieldCompare vnId="v90001" field="description" current="auto" vndb="VNDB text" egs="EGS text" label="Synopsis" />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'EGS' }));
    expect(screen.getByText('EGS text')).toBeTruthy();
  });

  it('navigates tabs with the arrow keys', () => {
    renderWithProviders(
      <FieldCompare vnId="v90001" field="description" current="auto" vndb="VNDB text" egs="EGS text" label="Synopsis" />,
    );
    const tablist = screen.getByRole('tablist', { name: 'Synopsis' });
    fireEvent.keyDown(tablist, { key: 'Enter' });
    expect(screen.getByRole('tab', { name: 'VNDB' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'EGS' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'VNDB' }).getAttribute('aria-selected')).toBe('true');
  });

  it('PATCHes source-pref with the field when pinning the active tab as default', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(
      <FieldCompare vnId="v90001" field="description" current="auto" vndb="VNDB text" egs="EGS text" label="Synopsis" />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'EGS' }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.setDefault }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/collection/v90001/source-pref');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ description: 'egs' });
  });

  it('opens the side-by-side compare view and PATCHes when picking a column', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(
      <FieldCompare vnId="v90001" field="description" current="vndb" vndb="VNDB text" egs="EGS text" label="Synopsis" />,
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    expect(screen.getByRole('button', { name: t.compare.useEgs })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.compare.useEgs }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ description: 'egs' });
  });

  it('PATCHes VNDB when picking the VNDB column from the compare view', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(
      <FieldCompare vnId="v90001" field="description" current="egs" vndb="VNDB text" egs="EGS text" label="Synopsis" />,
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useVndb }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ description: 'vndb' });
  });

  it('reverts and surfaces a toast when the PATCH fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ error: 'pref failed' }, 500));
    renderWithProviders(
      <FieldCompare vnId="v90001" field="description" current="vndb" vndb="VNDB text" egs="EGS text" label="Synopsis" />,
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useEgs }));
    expect(await screen.findByText('pref failed')).toBeTruthy();
  });

  it('uses the Auto button to persist auto preference', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderWithProviders(
      <FieldCompare vnId="v90001" field="description" current="vndb" vndb="VNDB text" egs="EGS text" label="Synopsis" />,
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useAuto }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ description: 'auto' });
  });

  it('closes the compare view with the Close button', () => {
    renderWithProviders(
      <FieldCompare vnId="v90001" field="description" current="auto" vndb="VNDB text" egs="EGS text" label="Synopsis" />,
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    expect(screen.getByRole('button', { name: t.compare.useVndb })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.common.close }));
    expect(screen.queryByRole('button', { name: t.compare.useVndb })).toBeNull();
  });

  it('shows the empty-side notice when the active tab body is blank but the field is linked', () => {
    renderWithProviders(
      <FieldCompare vnId="v90001" field="description" current="auto" vndb={null} egs={null} label="Synopsis" egsLinked />,
    );
    fireEvent.click(screen.getByRole('tab', { name: /^EGS/ }));
    expect(screen.getByText(t.compare.noEgsValue)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /^VNDB/ }));
    expect(screen.getByText(t.compare.noVndbValue)).toBeTruthy();
  });

  it('renders forceCollapsed without any compare affordance', () => {
    renderWithProviders(
      <FieldCompare vnId="v90001" field="description" current="auto" vndb="VNDB text" egs="EGS text" label="Synopsis" forceCollapsed />,
    );
    expect(screen.getByText('VNDB text')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('button', { name: t.compare.compareBtn })).toBeNull();
  });

  it('does not submit a second persistence action in the same render tick', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((res) => { resolveFetch = res; }));
    global.fetch = fetchMock;
    renderWithProviders(
      <FieldCompare vnId="v90001" field="description" current="vndb" vndb="VNDB text" egs="EGS text" label="Synopsis" />,
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    const useEgs = screen.getByRole('button', { name: t.compare.useEgs });
    const auto = screen.getByRole('button', { name: t.compare.useAuto });
    act(() => {
      fireEvent.click(useEgs);
      fireEvent.click(auto);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(jsonResponse({ ok: true }));
    await waitFor(() => expect((auto as HTMLButtonElement).disabled).toBe(false));
  });

  it('optimistically hides the collapsed pin action while saving its new default', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((res) => { resolveFetch = res; }));
    renderWithProviders(
      <FieldCompare vnId="v90001" field="description" current="auto" vndb="VNDB text" egs="EGS text" label="Synopsis" />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'EGS' }));
    const setDefault = screen.getByRole('button', { name: t.compare.setDefault });
    fireEvent.click(setDefault);
    expect(screen.queryByRole('button', { name: t.compare.setDefault })).toBeNull();
    resolveFetch(jsonResponse({ ok: true }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });

  it('renders the empty placeholder for both compare columns when linked sources are blank', () => {
    renderWithProviders(
      <FieldCompare vnId="v90001" field="description" current="auto" vndb={null} egs={null} label="Synopsis" egsLinked />,
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    expect(screen.getAllByText('-')).toHaveLength(2);
  });

  it('ignores a successful save result after the component unmounts', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((res) => { resolveFetch = res; }));
    const { unmount } = renderWithProviders(
      <FieldCompare vnId="v90001" field="description" current="vndb" vndb="VNDB text" egs="EGS text" label="Synopsis" />,
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useEgs }));
    unmount();
    await act(async () => {
      resolveFetch(jsonResponse({ ok: true }));
      await Promise.resolve();
    });
  });

  it('ignores a failed save result after the component unmounts', async () => {
    let rejectFetch: (error: Error) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((_resolve, reject) => { rejectFetch = reject; }));
    const { unmount } = renderWithProviders(
      <FieldCompare vnId="v90001" field="description" current="vndb" vndb="VNDB text" egs="EGS text" label="Synopsis" />,
    );
    fireEvent.click(screen.getByRole('button', { name: t.compare.compareBtn }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useEgs }));
    unmount();
    await act(async () => {
      rejectFetch(new Error('late failure'));
      await Promise.resolve();
    });
  });
});
