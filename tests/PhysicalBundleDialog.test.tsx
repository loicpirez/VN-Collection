// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PhysicalBundleDialog } from '@/components/PhysicalBundleDialog';
import type { PhysicalBundle, ShelfEntry } from '@/lib/db';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const mocks = vi.hoisted(() => ({ confirm: vi.fn(), toastError: vi.fn() }));

vi.mock('@/components/ConfirmDialog', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/components/ConfirmDialog')>();
  return { ...original, useConfirm: () => ({ confirm: mocks.confirm, prompt: vi.fn() }) };
});
vi.mock('@/components/ToastProvider', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/components/ToastProvider')>();
  return { ...original, useToast: () => ({ error: mocks.toastError, success: vi.fn(), warning: vi.fn(), info: vi.fn() }) };
});
vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt }: { alt: string }) => <span data-testid="bundle-image">{alt}</span>,
}));

const t = dictionaries.en;

function candidate(index: number, overrides: Partial<ShelfEntry> = {}): ShelfEntry {
  const suffix = String(990500 + index);
  return {
    vn_id: `v${suffix}`,
    release_id: `r${suffix}`,
    notes: null,
    location: 'unknown',
    physical_location: [],
    box_type: 'none',
    edition_label: `Edition ${index}`,
    condition: null,
    price_paid: null,
    currency: null,
    acquired_date: null,
    owned_platform: null,
    dumped: false,
    added_at: index,
    vn_title: `Synthetic title ${index}`,
    vn_image_thumb: null,
    vn_image_url: null,
    vn_local_image_thumb: null,
    vn_image_sexual: null,
    rel_image_thumb: null,
    rel_image_url: null,
    rel_local_image_thumb: null,
    rel_image_sexual: null,
    vn_platforms: [],
    vn_languages: [],
    vn_released: null,
    rel_title: null,
    rel_platforms: [],
    rel_languages: [],
    rel_released: null,
    rel_resolution: null,
    rel_minage: null,
    rel_patch: false,
    rel_freeware: false,
    rel_official: true,
    rel_has_ero: false,
    bundle_id: null,
    bundle_name: null,
    bundle_member_count: 0,
    ...overrides,
  };
}

function bundle(): PhysicalBundle {
  return {
    id: 7,
    name: 'Existing trilogy',
    anchor_vn_id: 'v990501',
    anchor_release_id: 'r990501',
    created_at: 1,
    updated_at: 2,
    members: [
      { vn_id: 'v990501', release_id: 'r990501', vn_title: 'Member A', edition_label: null, position: 0 },
      { vn_id: 'v990502', release_id: 'r990502', vn_title: 'Member B', edition_label: null, position: 1 },
    ],
  };
}

function json(value: object, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  mocks.confirm.mockReset();
  mocks.toastError.mockReset();
});

describe('PhysicalBundleDialog', () => {
  it('preserves existing-bundle row actions while the list loads', () => {
    global.fetch = vi.fn(() => new Promise<Response>(() => undefined));
    renderWithProviders(<PhysicalBundleDialog open onClose={vi.fn()} candidates={[]} onChanged={vi.fn()} />, { locale: 'en' });

    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveAttribute('data-physical-bundle-skeleton');
    expect(skeleton.querySelectorAll('li')).toHaveLength(4);
    expect(skeleton.querySelectorAll('.h-11.w-24')).toHaveLength(3);
  });

  it('searches and paginates eligible unbundled candidates', async () => {
    global.fetch = vi.fn(async () => json({ bundles: [] }));
    const candidates = Array.from({ length: 27 }, (_, index) => candidate(index + 1));
    candidates.push(candidate(90, { bundle_id: 9, bundle_name: 'Already grouped', bundle_member_count: 2 }));
    renderWithProviders(<PhysicalBundleDialog open onClose={vi.fn()} candidates={candidates} onChanged={vi.fn()} />, { locale: 'en' });

    await screen.findByText(t.shelfLayout.bundleEmpty);
    expect(screen.getAllByRole('checkbox')).toHaveLength(24);
    fireEvent.click(screen.getByRole('button', { name: t.common.next }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: t.common.back }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(24);

    fireEvent.change(screen.getByPlaceholderText(t.search.placeholder), { target: { value: 'title 26' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText(t.search.placeholder), { target: { value: 'r990527' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText(t.search.placeholder), { target: { value: 'edition 25' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText(t.search.placeholder), { target: { value: 'missing candidate' } });
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByText(t.shelfLayout.unplacedEmpty)).toBeInTheDocument();
    expect(screen.queryByText('Already grouped')).toBeNull();
  });

  it('creates a bundle with an explicit anchor and refreshes shelf surfaces', async () => {
    const created = { ...bundle(), id: 8, name: 'Created trilogy' };
    global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => (
      init?.method === 'POST' ? json({ bundle: created }, 201) : json({ bundles: [bundle()] })
    ));
    const onChanged = vi.fn(async () => undefined);
    renderWithProviders(<PhysicalBundleDialog open onClose={vi.fn()} candidates={[candidate(1), candidate(2)]} onChanged={onChanged} />, { locale: 'en' });
    await screen.findByText('Existing trilogy');

    fireEvent.change(screen.getByLabelText(t.shelfLayout.bundleName), { target: { value: 'New trilogy' } });
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[1]);
    fireEvent.click(checkboxes[1]);
    expect(radios[0]).toBeChecked();
    fireEvent.click(checkboxes[1]);
    fireEvent.click(radios[1]);
    fireEvent.click(screen.getByRole('button', { name: t.shelfLayout.bundleCreate }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Created trilogy')).toBeInTheDocument();
    const post = vi.mocked(global.fetch).mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      name: 'New trilogy',
      anchor: { vn_id: 'v990502', release_id: 'r990502' },
    });
  });

  it('dissolves an existing bundle only after confirmation', async () => {
    global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => (
      init?.method === 'DELETE' ? json({ ok: true }) : json({ bundles: [bundle()] })
    ));
    const onChanged = vi.fn();
    mocks.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderWithProviders(<PhysicalBundleDialog open onClose={vi.fn()} candidates={[]} onChanged={onChanged} />, { locale: 'en' });
    await screen.findByText('Existing trilogy');

    const dissolve = screen.getByRole('button', { name: t.shelfLayout.bundleDissolve });
    fireEvent.click(dissolve);
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
    fireEvent.click(dissolve);
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Existing trilogy')).toBeNull();
  });

  it('surfaces malformed loads and failed mutations without stale success', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(json({ bundles: 'bad' }))
      .mockResolvedValueOnce(json({ bundles: [] }))
      .mockResolvedValueOnce(json({ error: 'create rejected' }, 400));
    const view = renderWithProviders(<PhysicalBundleDialog open onClose={vi.fn()} candidates={[candidate(1), candidate(2)]} onChanged={vi.fn()} />, { locale: 'en' });
    await screen.findByRole('alert');

    view.rerender(<PhysicalBundleDialog open={false} onClose={vi.fn()} candidates={[candidate(1), candidate(2)]} onChanged={vi.fn()} />);
    view.rerender(<PhysicalBundleDialog open onClose={vi.fn()} candidates={[candidate(1), candidate(2)]} onChanged={vi.fn()} />);
    await screen.findByText(t.shelfLayout.bundleEmpty);
    fireEvent.change(screen.getByLabelText(t.shelfLayout.bundleName), { target: { value: 'Rejected' } });
    for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: t.shelfLayout.bundleCreate }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('create rejected'));
    expect(screen.getByRole('alert')).toHaveTextContent('create rejected');
  });

  it('reports a failed dissolve and preserves the bundle', async () => {
    global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => (
      init?.method === 'DELETE' ? json({ error: 'dissolve rejected' }, 500) : json({ bundles: [bundle()] })
    ));
    mocks.confirm.mockResolvedValue(true);
    renderWithProviders(<PhysicalBundleDialog open onClose={vi.fn()} candidates={[]} onChanged={vi.fn()} />, { locale: 'en' });
    await screen.findByText('Existing trilogy');

    fireEvent.click(screen.getByRole('button', { name: t.shelfLayout.bundleDissolve }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('dissolve rejected'));
    expect(screen.getByRole('alert')).toHaveTextContent('dissolve rejected');
    expect(screen.getByText('Existing trilogy')).toBeInTheDocument();
  });

  it('uses the generic mutation error when dissolve fails without a message', async () => {
    global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') throw new Error('');
      return json({ bundles: [bundle()] });
    });
    mocks.confirm.mockResolvedValue(true);
    renderWithProviders(<PhysicalBundleDialog open onClose={vi.fn()} candidates={[]} onChanged={vi.fn()} />, { locale: 'en' });
    await screen.findByText('Existing trilogy');

    fireEvent.click(screen.getByRole('button', { name: t.shelfLayout.bundleDissolve }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(t.shelfLayout.saveFailed));
  });

  it('keeps the anchor stable when another member is removed and clears it with the last member', async () => {
    global.fetch = vi.fn(async () => json({ bundles: [] }));
    renderWithProviders(<PhysicalBundleDialog open onClose={vi.fn()} candidates={[candidate(1), candidate(2)]} onChanged={vi.fn()} />, { locale: 'en' });
    await screen.findByText(t.shelfLayout.bundleEmpty);
    const checkboxes = screen.getAllByRole('checkbox');
    const radios = screen.getAllByRole('radio');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(checkboxes[1]);
    expect(radios[0]).toBeChecked();
    fireEvent.click(checkboxes[0]);
    expect(radios[0]).not.toBeChecked();
  });

  it('aborts an in-flight load when the dialog closes', async () => {
    const requestState: {
      signal: AbortSignal | null;
      resolve: ((response: Response) => void) | null;
    } = { signal: null, resolve: null };
    global.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestState.signal = init?.signal ?? null;
      return new Promise<Response>((resolve) => { requestState.resolve = resolve; });
    });
    const view = renderWithProviders(<PhysicalBundleDialog open onClose={vi.fn()} candidates={[]} onChanged={vi.fn()} />, { locale: 'en' });
    await waitFor(() => expect(requestState.signal).not.toBeNull());

    view.rerender(<PhysicalBundleDialog open={false} onClose={vi.fn()} candidates={[]} onChanged={vi.fn()} />);
    expect(requestState.signal?.aborted).toBe(true);
    requestState.resolve?.(json({ bundles: [bundle()] }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Existing trilogy')).toBeNull();
  });

  it('reports HTTP and empty network load errors', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(json({ error: 'load rejected' }, 503));
    const first = renderWithProviders(<PhysicalBundleDialog open onClose={vi.fn()} candidates={[]} onChanged={vi.fn()} />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent('load rejected');
    first.unmount();

    global.fetch = vi.fn().mockRejectedValueOnce(new Error(''));
    renderWithProviders(<PhysicalBundleDialog open onClose={vi.fn()} candidates={[]} onChanged={vi.fn()} />, { locale: 'en' });
    expect(await screen.findByRole('alert')).toHaveTextContent(t.shelfLayout.bundleLoadFailed);
  });

  it('ignores a rejected load after the dialog has already closed', async () => {
    const requestState: { reject: ((reason: Error) => void) | null } = { reject: null };
    global.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      expect(init?.signal).toBeDefined();
      requestState.reject = reject;
    }));
    const view = renderWithProviders(<PhysicalBundleDialog open onClose={vi.fn()} candidates={[]} onChanged={vi.fn()} />, { locale: 'en' });
    await waitFor(() => expect(requestState.reject).not.toBeNull());
    view.rerender(<PhysicalBundleDialog open={false} onClose={vi.fn()} candidates={[]} onChanged={vi.fn()} />);
    requestState.reject?.(new Error('late failure'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('falls back to the first remaining member when the selected anchor disappears', async () => {
    global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => (
      init?.method === 'POST' ? json({ bundle: bundle() }, 201) : json({ bundles: [] })
    ));
    const one = candidate(1, { edition_label: null, rel_title: 'Release title one' });
    const two = candidate(2, { edition_label: null, rel_title: null });
    const three = candidate(3);
    const view = renderWithProviders(<PhysicalBundleDialog open onClose={vi.fn()} candidates={[one, two, three]} onChanged={vi.fn()} />, { locale: 'en' });
    await screen.findByText(t.shelfLayout.bundleEmpty);
    fireEvent.change(screen.getByLabelText(t.shelfLayout.bundleName), { target: { value: 'Fallback anchor' } });
    for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox);
    fireEvent.click(screen.getAllByRole('radio')[2]);

    view.rerender(<PhysicalBundleDialog open onClose={vi.fn()} candidates={[one, two]} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: t.shelfLayout.bundleCreate }));
    await waitFor(() => expect(vi.mocked(global.fetch).mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));
    const post = vi.mocked(global.fetch).mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body)).anchor).toEqual({ vn_id: one.vn_id, release_id: one.release_id });
  });

  it('does not submit when prop changes leave fewer than two eligible selected members', async () => {
    global.fetch = vi.fn(async () => json({ bundles: [] }));
    const one = candidate(1);
    const two = candidate(2);
    const view = renderWithProviders(<PhysicalBundleDialog open onClose={vi.fn()} candidates={[one, two]} onChanged={vi.fn()} />, { locale: 'en' });
    await screen.findByText(t.shelfLayout.bundleEmpty);
    fireEvent.change(screen.getByLabelText(t.shelfLayout.bundleName), { target: { value: 'No longer valid' } });
    for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox);
    view.rerender(<PhysicalBundleDialog open onClose={vi.fn()} candidates={[one]} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: t.shelfLayout.bundleCreate }));
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
  });

  it('reports malformed create payloads and empty mutation errors', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(json({ bundles: [] }))
      .mockResolvedValueOnce(json({ bundle: 'bad' }, 201));
    const first = renderWithProviders(<PhysicalBundleDialog open onClose={vi.fn()} candidates={[candidate(1), candidate(2)]} onChanged={vi.fn()} />, { locale: 'en' });
    await screen.findByText(t.shelfLayout.bundleEmpty);
    fireEvent.change(screen.getByLabelText(t.shelfLayout.bundleName), { target: { value: 'Malformed' } });
    for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: t.shelfLayout.bundleCreate }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(t.shelfLayout.saveFailed));
    first.unmount();

    mocks.toastError.mockReset();
    global.fetch = vi.fn()
      .mockResolvedValueOnce(json({ bundles: [] }))
      .mockRejectedValueOnce(new Error(''));
    renderWithProviders(<PhysicalBundleDialog open onClose={vi.fn()} candidates={[candidate(1), candidate(2)]} onChanged={vi.fn()} />, { locale: 'en' });
    await screen.findByText(t.shelfLayout.bundleEmpty);
    fireEvent.change(screen.getByLabelText(t.shelfLayout.bundleName), { target: { value: 'Network error' } });
    for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: t.shelfLayout.bundleCreate }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(t.shelfLayout.saveFailed));
  });
});
