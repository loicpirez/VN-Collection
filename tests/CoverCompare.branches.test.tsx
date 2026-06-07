// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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

const vndb = { remote: 'https://example.com/vndb.jpg', local: null };
const egs = { remote: 'https://example.com/egs.jpg', local: null };
const custom = { remote: null, local: 'cover/custom.jpg' };
const empty = { remote: null, local: null };

function renderCompare(ui: React.ReactElement) {
  return renderWithProviders(<DisplaySettingsProvider>{ui}</DisplaySettingsProvider>);
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CoverCompare branches', () => {
  it('renders no image and no compare control when every poster is empty', () => {
    renderCompare(
      <CoverCompare vnId="v90001" current="auto" vndb={empty} egs={empty} custom={empty} sexual={0} alt="Title Y" />,
    );
    // pickColumn returns { used: null } -> no compare control with zero posters.
    expect(screen.queryByRole('button', { name: new RegExp(t.compare.compareBtn) })).toBeNull();
  });

  it('resolves to the EGS-only column when EGS is the sole poster', () => {
    renderCompare(
      <CoverCompare vnId="v90001" current="vndb" vndb={empty} egs={egs} custom={empty} sexual={0} alt="Title Y" />,
    );
    // Only EGS populated -> used 'egs', no compare control (single poster).
    expect(screen.queryByRole('button', { name: new RegExp(t.compare.compareBtn) })).toBeNull();
  });

  it('shows the custom source label in the collapsed badge when custom resolves active', () => {
    renderCompare(
      <CoverCompare vnId="v90001" current="custom" vndb={vndb} egs={empty} custom={custom} sexual={0} alt="Title Y" />,
    );
    // Two posters -> compare control present; resolved used is custom.
    expect(screen.getByRole('button', { name: new RegExp(t.compare.compareBtn) })).toBeInTheDocument();
    expect(screen.getByText(t.coverPicker.custom)).toBeInTheDocument();
  });

  it('PATCHes image=vndb when picking the VNDB column from compare mode', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderCompare(
      <CoverCompare vnId="v90001" current="egs" vndb={vndb} egs={egs} custom={empty} sexual={0} alt="Title Y" />,
    );
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compare.compareBtn) }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useVndb }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/collection/v90001/source-pref');
      expect(JSON.parse(call![1].body)).toEqual({ image: 'vndb' });
    });
  });

  it('PATCHes image=custom when picking the custom column from compare mode', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderCompare(
      <CoverCompare vnId="v90001" current="vndb" vndb={vndb} egs={egs} custom={custom} sexual={0} alt="Title Y" />,
    );
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compare.compareBtn) }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useCustom }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/collection/v90001/source-pref');
      expect(JSON.parse(call![1].body)).toEqual({ image: 'custom' });
    });
  });

  it('PATCHes image=auto via the Auto button', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderCompare(
      <CoverCompare vnId="v90001" current="vndb" vndb={vndb} egs={egs} custom={empty} sexual={0} alt="Title Y" />,
    );
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compare.compareBtn) }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useAuto }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/collection/v90001/source-pref');
      expect(JSON.parse(call![1].body)).toEqual({ image: 'auto' });
    });
  });

  it('ignores a cover-changed event addressed to a different VN', () => {
    renderCompare(
      <CoverCompare vnId="v90007" current="auto" vndb={vndb} egs={empty} custom={empty} sexual={0} alt="Rotated" />,
    );
    const img = screen.getByAltText('Rotated') as HTMLImageElement;
    expect(img.style.transform).toBe('');
    act(() => {
      // Different vnId -> handler returns early, rotation stays 0.
      dispatchCoverChanged({ vnId: 'v90999', newSrc: null, newLocal: null, rotation: 90 });
    });
    expect((screen.getByAltText('Rotated') as HTMLImageElement).style.transform).toBe('');
  });

  it('ignores a cover-changed event without a numeric rotation', () => {
    renderCompare(
      <CoverCompare vnId="v90007" current="auto" vndb={vndb} egs={empty} custom={empty} sexual={0} alt="Rotated" />,
    );
    act(() => {
      // Matching vnId but no rotation field -> the typeof guard skips setRotation.
      dispatchCoverChanged({ vnId: 'v90007', newSrc: 'https://example.com/x.jpg', newLocal: null });
    });
    expect((screen.getByAltText('Rotated') as HTMLImageElement).style.transform).toBe('');
  });

  it('ignores a concurrent persist while one is already in flight', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((res) => { resolveFetch = res; }));
    global.fetch = fetchMock as unknown as typeof fetch;
    renderCompare(
      <CoverCompare vnId="v90001" current="vndb" vndb={vndb} egs={egs} custom={custom} sexual={0} alt="Title Y" />,
    );
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compare.compareBtn) }));
    const egsButton = screen.getByRole('button', { name: t.compare.useEgs });
    const customButton = screen.getByRole('button', { name: t.compare.useCustom });
    act(() => {
      egsButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      customButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    await waitFor(() => expect(screen.getByText(t.toast.saved)).toBeInTheDocument());
  });

  it('drops a successful persist after the VN identity changes', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    const { rerender } = renderCompare(
      <CoverCompare vnId="v90001" current="vndb" vndb={vndb} egs={egs} custom={custom} sexual={0} alt="Title Y" />,
    );
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compare.compareBtn) }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useEgs }));
    rerender(
      <DisplaySettingsProvider>
        <CoverCompare vnId="v90002" current="vndb" vndb={vndb} egs={egs} custom={custom} sexual={0} alt="Title Y" />
      </DisplaySettingsProvider>,
    );

    await act(async () => {
      resolveFetch(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
      await Promise.resolve();
    });

    expect(screen.queryByText(t.toast.saved)).toBeNull();
  });

  it('drops a failed persist after the VN identity changes', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    const { rerender } = renderCompare(
      <CoverCompare vnId="v90001" current="vndb" vndb={vndb} egs={egs} custom={custom} sexual={0} alt="Title Y" />,
    );
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compare.compareBtn) }));
    fireEvent.click(screen.getByRole('button', { name: t.compare.useEgs }));
    rerender(
      <DisplaySettingsProvider>
        <CoverCompare vnId="v90002" current="vndb" vndb={vndb} egs={egs} custom={custom} sexual={0} alt="Title Y" />
      </DisplaySettingsProvider>,
    );

    await act(async () => {
      resolveFetch(new Response(JSON.stringify({ error: 'late cover failure' }), { status: 500, headers: { 'content-type': 'application/json' } }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText('late cover failure')).toBeNull();
  });
});
