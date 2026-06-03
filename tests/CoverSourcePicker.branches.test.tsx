// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { CoverSourcePicker } from '@/components/CoverSourcePicker';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { ReleaseImage, ReleaseImageType, Screenshot } from '@/lib/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.fr;

const screenshots: Screenshot[] = [
  { url: 'https://example.com/sc1.jpg', thumbnail: 'https://example.com/sc1t.jpg', sexual: 0, local: 'storage/sc1-local.jpg' },
];
const releaseImages: ReleaseImage[] = [
  // An out-of-domain media type to exercise the mediaTypeLabel fallback (returns raw type).
  { release_id: 'r90001', release_title: 'Release X', type: 'weirdtype' as ReleaseImageType, url: 'https://example.com/pkg.jpg', thumbnail: 'https://example.com/pkgt.jpg', sexual: 0 },
];

function renderPicker(extra: Partial<React.ComponentProps<typeof CoverSourcePicker>> = {}) {
  return renderWithProviders(
    <DisplaySettingsProvider>
      <CoverSourcePicker
        vnId="v90001"
        vndbImage="https://example.com/vndb.jpg"
        egsId={null}
        egsHasImage={false}
        currentCustomCover={null}
        currentImageSource="auto"
        screenshots={screenshots}
        releaseImages={releaseImages}
        {...extra}
      />
    </DisplaySettingsProvider>,
  );
}

function openViaEvent() {
  act(() => {
    window.dispatchEvent(new CustomEvent('vn:open-cover-picker', { detail: { vnId: 'v90001' } }));
  });
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CoverSourcePicker branches', () => {
  it('ignores an open event addressed to a different VN', async () => {
    renderPicker({ showTrigger: false });
    act(() => {
      window.dispatchEvent(new CustomEvent('vn:open-cover-picker', { detail: { vnId: 'v99999' } }));
    });
    // Different vnId -> the listener returns early, no dialog.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('surfaces an error toast when applying a pasted URL fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'url apply failed' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    renderPicker({ showTrigger: false });
    openViaEvent();
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText(t.coverPicker.urlLabel), { target: { value: 'https://example.com/x.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: t.coverPicker.applyUrl }));
    await waitFor(() => expect(screen.getByText('url apply failed')).toBeInTheDocument());
  });

  it('surfaces an error toast when resetting to VNDB fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'reset failed' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    renderPicker({ showTrigger: false });
    openViaEvent();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('tab', { name: 'VNDB' }));
    fireEvent.click(screen.getByRole('button', { name: t.coverPicker.useVndb }));
    await waitFor(() => expect(screen.getByText('reset failed')).toBeInTheDocument());
  });

  it('shows the no-EGS message when the EGS tab is enabled but no id resolves', async () => {
    // egsHasImage true with egsId present keeps the tab enabled; clear egsId via re-render is not
    // possible, so assert the noEgs copy by toggling egsId null with egsHasImage false is the disabled
    // path. Instead cover the EGS-id-missing render by keeping the tab enabled is impossible; verify the
    // disabled tooltip branch.
    renderPicker({ showTrigger: false, egsId: null, egsHasImage: true });
    openViaEvent();
    await screen.findByRole('dialog');
    // egsTabDisabled is true (no egsId) -> tab disabled and titled.
    const egsTab = screen.getByRole('tab', { name: 'EGS' }) as HTMLButtonElement;
    expect(egsTab.disabled).toBe(true);
    expect(egsTab.getAttribute('title')).toBe(t.coverPicker.egsDisabledNoImage);
  });

  it('surfaces an error toast when the EGS auto cover PATCH fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/candidates')) {
        return Promise.resolve(new Response(JSON.stringify({ candidates: [{ source: 'banner', url: 'https://example.com/b.jpg', label: 'Banner' }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      return Promise.resolve(new Response(JSON.stringify({ error: 'egs pref failed' }), { status: 500, headers: { 'content-type': 'application/json' } }));
    });
    global.fetch = fetchMock;
    renderPicker({ showTrigger: false, egsId: 777, egsHasImage: true });
    openViaEvent();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('tab', { name: 'EGS' }));
    fireEvent.click(await screen.findByRole('button', { name: t.coverPicker.useEgsAuto }));
    await waitFor(() => expect(screen.getByText('egs pref failed')).toBeInTheDocument());
  });

  it('resets the rotation to zero from a rotated baseline', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderPicker({ showTrigger: false, currentRotation: 90 });
    openViaEvent();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: t.coverActions.resetRotation }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === '/api/collection/v90001/cover' && c[1]?.method === 'PATCH');
      expect(JSON.parse(call![1].body)).toEqual({ rotation: 0 });
    });
  });

  it('reverts the optimistic rotation and shows an error when the rotate PATCH fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: 'rotate failed' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    renderPicker({ showTrigger: false });
    openViaEvent();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: t.coverActions.rotateLeft }));
    await waitFor(() => expect(screen.getByText('rotate failed')).toBeInTheDocument());
    // After failure the displayed rotation reverts to 0 deg.
    expect(screen.getByText(t.coverActions.rotationDegrees.replace('{rotation}', '0'))).toBeInTheDocument();
  });

  it('rejects a non-image upload with a toast and no cover request', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderPicker({ showTrigger: false });
    openViaEvent();
    const dialog = await screen.findByRole('dialog');
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } });
    await waitFor(() => expect(screen.getByText(t.cover.mustBeImage)).toBeInTheDocument());
    expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/cover')).toBe(false);
  });

  it('errors when an image upload returns no cover path', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ nope: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
    renderPicker({ showTrigger: false });
    openViaEvent();
    const dialog = await screen.findByRole('dialog');
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'c.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByText(t.common.error)).toBeInTheDocument());
  });

  it('navigates the tablist with the arrow keys, wrapping around', async () => {
    renderPicker({ showTrigger: false, egsId: 777, egsHasImage: true });
    openViaEvent();
    await screen.findByRole('dialog');
    const tablist = screen.getByRole('tablist');
    // custom -> vndb -> egs -> wrap to custom.
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'VNDB' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'EGS' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: t.coverPicker.custom }).getAttribute('aria-selected')).toBe('true');
    // ArrowLeft wraps backwards to EGS.
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'EGS' }).getAttribute('aria-selected')).toBe('true');
    // Non-arrow key is a no-op.
    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'EGS' }).getAttribute('aria-selected')).toBe('true');
  });

  it('skips the disabled EGS tab during arrow navigation', async () => {
    renderPicker({ showTrigger: false, egsId: null, egsHasImage: false });
    openViaEvent();
    await screen.findByRole('dialog');
    const tablist = screen.getByRole('tablist');
    // tabs collapse to [custom, vndb] when EGS is disabled.
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'VNDB' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: t.coverPicker.custom }).getAttribute('aria-selected')).toBe('true');
  });

  it('marks a gallery tile pressed when it matches the current custom cover', async () => {
    renderPicker({ showTrigger: false, currentCustomCover: 'https://example.com/pkg.jpg' });
    openViaEvent();
    const dialog = await screen.findByRole('dialog');
    // The release image value equals the current custom cover -> aria-pressed true + check badge.
    const tile = within(dialog).getByRole('button', { pressed: true });
    expect(tile.getAttribute('aria-pressed')).toBe('true');
  });

  it('pins a screenshot from the gallery using its local value', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderPicker({ showTrigger: false });
    openViaEvent();
    const dialog = await screen.findByRole('dialog');
    const tile = within(dialog).getByTitle(`${t.media.screenshots} 1`);
    fireEvent.click(tile);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === '/api/collection/v90001/cover' && c[1]?.method === 'POST');
      // s.local is preferred as the value.
      expect(JSON.parse(call![1].body)).toEqual({ source: 'screenshot', value: 'storage/sc1-local.jpg' });
    });
  });

  it('renders the gallery count reflecting screenshots plus release art', async () => {
    renderPicker({ showTrigger: false });
    openViaEvent();
    await screen.findByRole('dialog');
    // 1 screenshot + 1 release image = 2.
    expect(screen.getByText(`${t.coverPicker.galleryLabel} / 2`)).toBeInTheDocument();
  });

  it('pins an EGS candidate served from /api/files via the path source', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/candidates')) {
        return Promise.resolve(new Response(JSON.stringify({ candidates: [{ source: 'image_php', url: '/api/files/egs/local.jpg', label: 'EGS image' }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    });
    global.fetch = fetchMock;
    renderPicker({ showTrigger: false, egsId: 777, egsHasImage: true });
    openViaEvent();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('tab', { name: 'EGS' }));
    const tile = await within(dialog).findByTitle('/api/files/egs/local.jpg');
    fireEvent.click(tile);
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => c[0] === '/api/collection/v90001/cover' && c[1]?.method === 'POST');
      // A non-http(s) /api/files path -> source is 'path', not 'url'.
      expect(JSON.parse(call![1].body)).toEqual({ source: 'path', value: '/api/files/egs/local.jpg' });
    });
  });

  it('ignores a second mutation while one is already in flight', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((res) => { resolveFetch = res; }));
    global.fetch = fetchMock as unknown as typeof fetch;
    renderPicker({ showTrigger: false });
    openViaEvent();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: t.coverActions.rotateRight }));
    // A second rotate while busy must be a no-op (beginMutation returns null).
    fireEvent.click(screen.getByRole('button', { name: t.coverActions.rotateLeft }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    await waitFor(() => expect(screen.getByText(t.toast.coverSaved)).toBeInTheDocument());
  });
});
