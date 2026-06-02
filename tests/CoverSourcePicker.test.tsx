// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { CoverSourcePicker } from '@/components/CoverSourcePicker';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { ReleaseImage, Screenshot } from '@/lib/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.fr;

const screenshots: Screenshot[] = [
  { url: 'https://example.com/sc1.jpg', thumbnail: 'https://example.com/sc1t.jpg', sexual: 0 },
];
const releaseImages: ReleaseImage[] = [
  { release_id: 'r90001', release_title: 'Release X', type: 'pkgfront', url: 'https://example.com/pkg.jpg', thumbnail: 'https://example.com/pkgt.jpg', sexual: 0 },
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

describe('CoverSourcePicker', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an inline trigger and opens the dialog on click', async () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.coverPicker.open) }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('tab', { name: t.coverPicker.custom })).toBeTruthy();
  });

  it('opens via the scoped open-cover-picker event on the Custom tab', async () => {
    renderPicker({ showTrigger: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    openViaEvent();
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('tab', { name: t.coverPicker.custom }).getAttribute('aria-selected')).toBe('true');
  });

  it('applies a pasted URL through POST then PATCH source-pref', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderPicker({ showTrigger: false });
    openViaEvent();
    await screen.findByRole('dialog');
    const urlInput = screen.getByLabelText(t.coverPicker.urlLabel);
    fireEvent.change(urlInput, { target: { value: 'https://example.com/new.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: t.coverPicker.applyUrl }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/cover' && c[1]?.method === 'POST')).toBe(true));
    const coverCall = fetchMock.mock.calls.find((c) => c[0] === '/api/collection/v90001/cover' && c[1]?.method === 'POST');
    expect(JSON.parse(coverCall![1].body)).toEqual({ source: 'url', value: 'https://example.com/new.jpg' });
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/source-pref')).toBe(true));
  });

  it('uploads a file via POST FormData on the Custom tab', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ cover: 'cover/v90001.jpg' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    renderPicker({ showTrigger: false });
    openViaEvent();
    const dialog = await screen.findByRole('dialog');
    // The dialog renders through a body-level portal, so query inside it.
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [new File(['x'], 'c.png', { type: 'image/png' })] } });
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/cover' && c[1]?.body instanceof FormData)).toBe(true));
  });

  it('switches to VNDB tab and resets to VNDB via DELETE + source-pref PATCH', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderPicker({ showTrigger: false });
    openViaEvent();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('tab', { name: 'VNDB' }));
    fireEvent.click(screen.getByRole('button', { name: t.coverPicker.useVndb }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/cover' && c[1]?.method === 'DELETE')).toBe(true));
  });

  it('disables the VNDB reset button when VNDB is already the active source', async () => {
    renderPicker({ showTrigger: false, currentImageSource: 'vndb' });
    openViaEvent();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('tab', { name: 'VNDB' }));
    expect((screen.getByRole('button', { name: t.coverPicker.useVndb }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(t.coverPicker.alreadyUsing)).toBeTruthy();
  });

  it('keeps the EGS tab disabled when no EGS image is available', async () => {
    renderPicker({ showTrigger: false, egsId: 555, egsHasImage: false });
    openViaEvent();
    await screen.findByRole('dialog');
    expect((screen.getByRole('tab', { name: 'EGS' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('rotates the cover via PATCH from the rotation row', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderPicker({ showTrigger: false });
    openViaEvent();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: t.coverActions.rotateRight }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/cover' && c[1]?.method === 'PATCH')).toBe(true));
    const patchCall = fetchMock.mock.calls.find((c) => c[0] === '/api/collection/v90001/cover' && c[1]?.method === 'PATCH');
    expect(JSON.parse(patchCall![1].body)).toEqual({ rotation: 90 });
  });

  it('loads the EGS candidate grid when the EGS tab is enabled and pins a candidate URL', async () => {
    const candidates = {
      candidates: [
        { source: 'banner', url: 'https://example.com/egs-banner.jpg', label: 'Banner' },
        { source: 'image_php', url: 'https://example.com/egs-image.jpg', label: 'EGS image' },
      ],
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/candidates')) {
        return Promise.resolve(new Response(JSON.stringify(candidates), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    });
    global.fetch = fetchMock;
    renderPicker({ showTrigger: false, egsId: 777, egsHasImage: true });
    openViaEvent();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('tab', { name: 'EGS' }));
    // Candidate fetch fires; both candidate tiles render with their labels.
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/egs-cover/777/candidates'))).toBe(true));
    const bannerTile = await within(dialog).findByTitle('https://example.com/egs-banner.jpg');
    fireEvent.click(bannerTile);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/cover' && c[1]?.method === 'POST')).toBe(true));
  });

  it('uses the EGS auto cover by PATCHing source-pref to egs', async () => {
    const candidates = { candidates: [{ source: 'banner', url: 'https://example.com/egs-banner.jpg', label: 'Banner' }] };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/candidates')) {
        return Promise.resolve(new Response(JSON.stringify(candidates), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    });
    global.fetch = fetchMock;
    renderPicker({ showTrigger: false, egsId: 777, egsHasImage: true });
    openViaEvent();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('tab', { name: 'EGS' }));
    fireEvent.click(await screen.findByRole('button', { name: t.coverPicker.useEgsAuto }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/source-pref')).toBe(true));
    const prefCall = fetchMock.mock.calls.find((c) => c[0] === '/api/collection/v90001/source-pref');
    expect(JSON.parse(prefCall![1].body)).toEqual({ image: 'egs' });
  });

  it('shows an error alert when the EGS candidate fetch fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/candidates')) {
        return Promise.resolve(new Response(JSON.stringify({ error: 'egs candidates failed' }), { status: 500, headers: { 'content-type': 'application/json' } }));
      }
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    });
    global.fetch = fetchMock;
    renderPicker({ showTrigger: false, egsId: 777, egsHasImage: true });
    openViaEvent();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('tab', { name: 'EGS' }));
    await waitFor(() => expect(within(dialog).getByText('egs candidates failed')).toBeTruthy());
  });

  it('picks a gallery image and POSTs it as the cover source', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderPicker({ showTrigger: false });
    openViaEvent();
    const dialog = await screen.findByRole('dialog');
    // Gallery tiles carry aria-pressed; click the first one.
    const tiles = within(dialog).getAllByRole('button', { pressed: false }).filter((b) => b.getAttribute('aria-pressed') !== null);
    expect(tiles.length).toBeGreaterThan(0);
    fireEvent.click(tiles[0]);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === '/api/collection/v90001/cover' && c[1]?.method === 'POST')).toBe(true));
  });
});
