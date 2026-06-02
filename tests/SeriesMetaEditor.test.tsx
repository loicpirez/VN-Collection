// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeriesMetaEditor } from '@/components/SeriesMetaEditor';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigationMocks,
}));

vi.mock('@/components/ToastProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ToastProvider')>();
  return {
    ...actual,
    useToast: () => toastMocks,
  };
});

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt, src }: { alt: string; src: string }) => <span>{`${alt}:${src}`}</span>,
}));

const t = dictionaries.en;

function jsonResponse(payload: unknown = { path: 'series/new.webp' }, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: Error) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (reason?: Error) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function editor(overrides: Partial<{
  seriesId: number;
  initialName: string;
  initialDescription: string | null;
  initialCoverPath: string | null;
  initialBannerPath: string | null;
}> = {}) {
  return (
    <SeriesMetaEditor
      seriesId={1}
      initialName="Series"
      initialDescription={null}
      initialCoverPath={null}
      initialBannerPath={null}
      {...overrides}
    />
  );
}

function fileInputs(container: HTMLElement): NodeListOf<HTMLInputElement> {
  return container.querySelectorAll<HTMLInputElement>('input[type="file"]');
}

function imageFile(name = 'image.webp'): File {
  return new File(['image'], name, { type: 'image/webp' });
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  navigationMocks.refresh.mockReset();
  toastMocks.error.mockReset();
  toastMocks.success.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SeriesMetaEditor', () => {
  it('renders local, API, and remote artwork paths and removes or resets draft artwork', () => {
    const { container } = renderWithProviders(editor({
      initialDescription: 'Description',
      initialCoverPath: 'series/cover.webp',
      initialBannerPath: 'https://cdn.example/banner.webp',
    }), { locale: 'en' });
    expect(screen.getByText(`${t.series.cover}:/api/files/series/cover.webp`)).toBeInTheDocument();
    expect(screen.getByText(`${t.series.banner}:https://cdn.example/banner.webp`)).toBeInTheDocument();
    const cancelButtons = screen.getAllByRole('button', { name: t.common.cancel });
    fireEvent.click(cancelButtons[0]);
    fireEvent.click(cancelButtons[1]);
    expect(screen.getByRole('button', { name: t.common.save })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: t.common.cancel }));
    expect(screen.getByText(`${t.series.cover}:/api/files/series/cover.webp`)).toBeInTheDocument();

    const inputs = fileInputs(container);
    expect(inputs).toHaveLength(2);
  });

  it('opens file pickers and ignores empty file changes', () => {
    const { container } = renderWithProviders(editor({ initialBannerPath: '/api/files/banner.webp' }), { locale: 'en' });
    const inputs = fileInputs(container);
    const cover = inputs[0];
    const banner = inputs[1];
    if (!cover || !banner) throw new Error('Missing file inputs');
    const coverClick = vi.spyOn(cover, 'click');
    const bannerClick = vi.spyOn(banner, 'click');
    const uploads = screen.getAllByRole('button', { name: t.series.upload });
    fireEvent.click(uploads[0]);
    fireEvent.click(uploads[1]);
    expect(coverClick).toHaveBeenCalledTimes(1);
    expect(bannerClick).toHaveBeenCalledTimes(1);
    fireEvent.change(cover, { target: { files: [] } });
    fireEvent.change(banner, { target: { files: [] } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('resets a draft with an absent initial description', () => {
    renderWithProviders(editor(), { locale: 'en' });
    fireEvent.change(screen.getByDisplayValue('Series'), { target: { value: 'Changed' } });
    fireEvent.change(screen.getByPlaceholderText(t.series.descriptionPlaceholder), { target: { value: 'Draft' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.cancel }));
    expect(screen.getByDisplayValue('Series')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(t.series.descriptionPlaceholder)).toHaveValue('');
  });

  it('uploads cover and banner images and displays decoded local paths', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ path: 'series/cover-new.webp' }))
      .mockResolvedValueOnce(jsonResponse({ path: '/api/files/banner-new.webp' }));
    const { container } = renderWithProviders(editor(), { locale: 'en' });
    const inputs = fileInputs(container);
    const cover = inputs[0];
    const banner = inputs[1];
    if (!cover || !banner) throw new Error('Missing file inputs');

    fireEvent.change(cover, { target: { files: [imageFile('cover.webp')] } });
    expect(await screen.findByText(`${t.series.cover}:/api/files/series/cover-new.webp`)).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith('/api/series/1/image', expect.objectContaining({ method: 'POST' }));

    fireEvent.change(banner, { target: { files: [imageFile('banner.webp')] } });
    expect(await screen.findByText(`${t.series.banner}:/api/files/banner-new.webp`)).toBeInTheDocument();
  });

  it('reports upload HTTP, malformed-payload, and network failures', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'upload failed' }, 500))
      .mockResolvedValueOnce(jsonResponse({ path: '' }))
      .mockRejectedValueOnce(new Error('network failed'));
    const { container } = renderWithProviders(editor(), { locale: 'en' });
    const cover = fileInputs(container)[0];
    if (!cover) throw new Error('Missing cover input');
    fireEvent.change(cover, { target: { files: [imageFile('one.webp')] } });
    await flushAsync();
    expect(toastMocks.error).toHaveBeenLastCalledWith('upload failed');
    fireEvent.change(cover, { target: { files: [imageFile('two.webp')] } });
    await flushAsync();
    expect(toastMocks.error).toHaveBeenLastCalledWith(t.common.error);
    fireEvent.change(cover, { target: { files: [imageFile('three.webp')] } });
    await flushAsync();
    expect(toastMocks.error).toHaveBeenLastCalledWith('network failed');
  });

  it('saves trimmed metadata, refreshes the page, and reports save failures', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ error: 'save failed' }, 500))
      .mockRejectedValueOnce(new Error('network failed'));
    renderWithProviders(editor(), { locale: 'en' });
    fireEvent.change(screen.getByDisplayValue('Series'), { target: { value: '  Renamed  ' } });
    fireEvent.change(screen.getByPlaceholderText(t.series.descriptionPlaceholder), { target: { value: '  Detail  ' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    await flushAsync();
    expect(fetch).toHaveBeenLastCalledWith('/api/series/1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Renamed',
        description: 'Detail',
        cover_path: null,
        banner_path: null,
      }),
    }));
    expect(toastMocks.success).toHaveBeenCalledWith(t.toast.saved);
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByDisplayValue(/Renamed/), { target: { value: 'Again' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    await flushAsync();
    expect(toastMocks.error).toHaveBeenLastCalledWith('save failed');
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    await flushAsync();
    expect(toastMocks.error).toHaveBeenLastCalledWith('network failed');
  });

  it('locks repeated uploads and ignores stale completions after identity changes', async () => {
    const upload = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(upload.promise);
    const rendered = renderWithProviders(editor(), { locale: 'en' });
    const cover = fileInputs(rendered.container)[0];
    if (!cover) throw new Error('Missing cover input');
    act(() => {
      fireEvent.change(cover, { target: { files: [imageFile('one.webp')] } });
      fireEvent.change(cover, { target: { files: [imageFile('two.webp')] } });
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const signal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    rendered.rerender(editor({ seriesId: 2, initialName: 'Next' }));
    expect(signal?.aborted).toBe(true);
    await act(async () => upload.resolve(jsonResponse({ path: 'series/stale.webp' })));
    expect(screen.queryByText(`${t.series.cover}:/api/files/series/stale.webp`)).not.toBeInTheDocument();

    const rejectedUpload = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(rejectedUpload.promise);
    const nextCover = fileInputs(rendered.container)[0];
    if (!nextCover) throw new Error('Missing cover input');
    fireEvent.change(nextCover, { target: { files: [imageFile('three.webp')] } });
    rendered.rerender(editor({ seriesId: 3, initialName: 'Third' }));
    await act(async () => rejectedUpload.reject(new Error('late upload')));
    expect(toastMocks.error).not.toHaveBeenCalled();
  });

  it('locks repeated saves while one write is pending', async () => {
    const save = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(save.promise);
    renderWithProviders(editor(), { locale: 'en' });
    fireEvent.change(screen.getByDisplayValue('Series'), { target: { value: 'Changed' } });
    const saveButton = screen.getByRole('button', { name: t.common.save });
    act(() => {
      saveButton.click();
      saveButton.click();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => save.resolve(jsonResponse({ ok: true })));
  });

  it('ignores stale save rejections after teardown', async () => {
    const save = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(save.promise);
    const rendered = renderWithProviders(editor(), { locale: 'en' });
    fireEvent.change(screen.getByDisplayValue('Series'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    rendered.unmount();
    await act(async () => save.reject(new Error('late failure')));
    expect(toastMocks.error).not.toHaveBeenCalled();

    vi.mocked(fetch).mockReset();
    const successfulSave = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(successfulSave.promise);
    const second = renderWithProviders(editor(), { locale: 'en' });
    fireEvent.change(screen.getByDisplayValue('Series'), { target: { value: 'Next' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    second.unmount();
    await act(async () => successfulSave.resolve(jsonResponse({ ok: true })));
    expect(toastMocks.success).not.toHaveBeenCalled();
  });
});
