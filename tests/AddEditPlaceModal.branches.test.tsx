// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, within, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { AddEditPlaceModal } from '@/components/AddEditPlaceModal';
import type { PlaceWithLinks } from '@/lib/db';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function place(overrides: Partial<PlaceWithLinks> = {}): PlaceWithLinks {
  return {
    id: 3,
    name: 'Editable Shop',
    name_ja: 'ショップ',
    kind: 'chain',
    address: '1-2-3 Somewhere',
    lat: 35.6,
    lng: 139.7,
    url: 'https://example.test',
    notes: 'note text',
    created_at: 1,
    updated_at: 1,
    provider_labels: [],
    stock_count: 0,
    ...overrides,
  };
}

function grantConsent() {
  try { localStorage.setItem('vncoll.map.external-network.v1', 'true'); } catch {}
}

function getDialog() {
  return screen.getByRole('dialog');
}

describe('AddEditPlaceModal branches', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch {}
    global.fetch = vi.fn(async () => json({ id: 1 }));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the add title with an initial branch hint when creating', () => {
    renderWithProviders(
      <AddEditPlaceModal place={null} initialBranch="Branch Hint" onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    expect(within(dialog).getByRole('heading', { name: new RegExp(t.places.addPlace as string) })).toBeInTheDocument();
    expect(within(dialog).getByText('Branch Hint')).toBeInTheDocument();
  });

  it('renders the edit title and prefilled values when editing', () => {
    renderWithProviders(
      <AddEditPlaceModal place={place()} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    expect(within(dialog).getByRole('heading', { name: t.places.editPlace as string })).toBeInTheDocument();
    expect((within(dialog).getByPlaceholderText(t.places.namePlaceholder as string) as HTMLInputElement).value).toBe('Editable Shop');
    // Clear-coordinates control is visible because lat/lng are set.
    expect(within(dialog).getByRole('button', { name: t.places.clearCoords as string })).toBeInTheDocument();
  });

  it('switches the kind via the kind chips', async () => {
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={null} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    const storageChip = within(dialog).getByRole('button', { name: t.places.kindStorage as string });
    await user.click(storageChip);
    expect(storageChip.className).toContain('chip-active');
  });

  it('clears coordinates when the clear control is clicked', async () => {
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={place()} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    await user.click(within(dialog).getByRole('button', { name: t.places.clearCoords as string }));
    expect((within(dialog).getByPlaceholderText('35.6894') as HTMLInputElement).value).toBe('');
    expect((within(dialog).getByPlaceholderText('139.6917') as HTMLInputElement).value).toBe('');
    // The control hides once both coordinates are empty.
    expect(within(dialog).queryByRole('button', { name: t.places.clearCoords as string })).toBeNull();
  });

  it('blocks geocoding and shows the privacy notice when consent is absent', async () => {
    renderWithProviders(
      <AddEditPlaceModal place={null} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    // The geocode search input is the second "Address"-placeholder field.
    const searchInput = within(dialog).getAllByPlaceholderText(t.places.addressPlaceholder as string)[1];
    const searchBtn = within(dialog).getByRole('button', { name: t.places.geocodeButton as string });
    expect(searchInput).toBeDisabled();
    expect(searchBtn).toBeDisabled();
  });

  it('geocodes successfully and fills coordinates from a picked result', async () => {
    grantConsent();
    global.fetch = vi.fn(async () =>
      json([{ display_name: 'Shibuya Crossing', lat: '35.6595', lon: '139.7005' }]),
    );
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={null} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    const searchInput = within(dialog).getAllByPlaceholderText(t.places.addressPlaceholder as string)[1];
    await user.type(searchInput, 'Shibuya{Enter}');
    const result = await within(dialog).findByRole('button', { name: 'Shibuya Crossing' });
    await user.click(result);
    expect((within(dialog).getByPlaceholderText('35.6894') as HTMLInputElement).value).toBe('35.6595');
    expect((within(dialog).getByPlaceholderText('139.6917') as HTMLInputElement).value).toBe('139.7005');
    // The address was empty so it adopts the picked display name.
    expect((within(dialog).getAllByPlaceholderText(t.places.addressPlaceholder as string)[0] as HTMLInputElement).value).toBe('Shibuya Crossing');
  });

  it('shows the geocode-empty message when no result comes back', async () => {
    grantConsent();
    global.fetch = vi.fn(async () => json([]));
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={null} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    const searchInput = within(dialog).getAllByPlaceholderText(t.places.addressPlaceholder as string)[1];
    await user.type(searchInput, 'void');
    await user.click(within(dialog).getByRole('button', { name: t.places.geocodeButton as string }));
    expect(await within(dialog).findByText(t.places.geocodeEmpty as string)).toBeInTheDocument();
  });

  it('shows the geocode-error message when Nominatim fails', async () => {
    grantConsent();
    global.fetch = vi.fn(async () => json({ error: 'down' }, 500));
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={null} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    const searchInput = within(dialog).getAllByPlaceholderText(t.places.addressPlaceholder as string)[1];
    await user.type(searchInput, 'fail');
    await user.click(within(dialog).getByRole('button', { name: t.places.geocodeButton as string }));
    expect(await within(dialog).findByText(t.places.geocodeError as string)).toBeInTheDocument();
  });

  it('shows the geocode-error message when the payload is malformed', async () => {
    grantConsent();
    global.fetch = vi.fn(async () => json({ not: 'array' }));
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={null} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    const searchInput = within(dialog).getAllByPlaceholderText(t.places.addressPlaceholder as string)[1];
    await user.type(searchInput, 'bad');
    await user.click(within(dialog).getByRole('button', { name: t.places.geocodeButton as string }));
    expect(await within(dialog).findByText(t.places.geocodeError as string)).toBeInTheDocument();
  });

  it('keeps an existing address when picking a geocode result', async () => {
    grantConsent();
    global.fetch = vi.fn(async () =>
      json([{ display_name: 'Auto Name', lat: '10', lon: '20' }]),
    );
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={place({ lat: null, lng: null, address: 'Keep Me' })} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    const searchInput = within(dialog).getAllByPlaceholderText(t.places.addressPlaceholder as string)[1];
    await user.type(searchInput, 'auto');
    await user.click(within(dialog).getByRole('button', { name: t.places.geocodeButton as string }));
    await user.click(await within(dialog).findByRole('button', { name: 'Auto Name' }));
    // Address is untouched.
    expect((within(dialog).getAllByPlaceholderText(t.places.addressPlaceholder as string)[0] as HTMLInputElement).value).toBe('Keep Me');
  });

  it('clears geocode state when consent is revoked mid-session', async () => {
    grantConsent();
    global.fetch = vi.fn(async () =>
      json([{ display_name: 'Will Vanish', lat: '10', lon: '20' }]),
    );
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={null} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    const searchInput = within(dialog).getAllByPlaceholderText(t.places.addressPlaceholder as string)[1];
    await user.type(searchInput, 'vanish');
    await user.click(within(dialog).getByRole('button', { name: t.places.geocodeButton as string }));
    await within(dialog).findByRole('button', { name: 'Will Vanish' });
    await user.click(within(dialog).getByRole('button', { name: t.map.externalPrivacyDisable as string }));
    await waitFor(() => expect(within(dialog).queryByRole('button', { name: 'Will Vanish' })).toBeNull());
  });

  it('creates a place and reports the new id on save', async () => {
    const calls: { url: string; method?: string; body: unknown }[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : null });
      return json({ id: 88 });
    });
    const onSaved = vi.fn();
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={null} onClose={vi.fn()} onSaved={onSaved} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    await user.type(within(dialog).getByPlaceholderText(t.places.namePlaceholder as string), 'Brand New');
    await user.click(within(dialog).getByRole('button', { name: t.places.saveChanges as string }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(88));
    expect(calls[0].url).toBe('/api/places');
    expect(calls[0].method).toBe('POST');
    expect((calls[0].body as { name: string }).name).toBe('Brand New');
  });

  it('saves all editable optional fields when creating a place', async () => {
    const calls: { body: Record<string, unknown> }[] = [];
    global.fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ body: init?.body ? JSON.parse(String(init.body)) : {} });
      return json({ id: 91 });
    });
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={null} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    await user.type(within(dialog).getByPlaceholderText(t.places.namePlaceholder as string), 'Full Place');
    await user.type(within(dialog).getByPlaceholderText(t.places.nameJaPlaceholder as string), 'フル');
    await user.type(within(dialog).getAllByPlaceholderText(t.places.addressPlaceholder as string)[0], 'Full address');
    await user.type(within(dialog).getByPlaceholderText('35.6894'), '35.1');
    await user.type(within(dialog).getByPlaceholderText('139.6917'), '139.2');
    await user.type(within(dialog).getByPlaceholderText(t.places.urlInputPlaceholder as string), 'https://shop.example.test');
    await user.type(within(dialog).getByPlaceholderText(t.places.notesPlaceholder as string), 'notes value');
    await user.click(within(dialog).getByRole('button', { name: t.places.saveChanges as string }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toMatchObject({
      name: 'Full Place',
      name_ja: 'フル',
      address: 'Full address',
      lat: 35.1,
      lng: 139.2,
      url: 'https://shop.example.test',
      notes: 'notes value',
    });
  });

  it('patches an existing place and reports no id on save', async () => {
    const calls: { url: string; method?: string }[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method });
      return json({ ok: true });
    });
    const onSaved = vi.fn();
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={place()} onClose={vi.fn()} onSaved={onSaved} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    const nameInput = within(dialog).getByPlaceholderText(t.places.namePlaceholder as string);
    await user.type(nameInput, ' Updated');
    await user.click(within(dialog).getByRole('button', { name: t.places.saveChanges as string }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith());
    expect(calls[0].url).toBe('/api/places/3');
    expect(calls[0].method).toBe('PATCH');
  });

  it('shows an inline error when the save request fails', async () => {
    global.fetch = vi.fn(async () => json({ error: 'save failed' }, 500));
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={place()} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    await user.type(within(dialog).getByPlaceholderText(t.places.namePlaceholder as string), ' x');
    await user.click(within(dialog).getByRole('button', { name: t.places.saveChanges as string }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
  });

  it('shows an inline error when create returns an HTTP error', async () => {
    global.fetch = vi.fn(async () => json({ error: 'create failed' }, 500));
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={null} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    await user.type(within(dialog).getByPlaceholderText(t.places.namePlaceholder as string), 'Create Fail');
    await user.click(within(dialog).getByRole('button', { name: t.places.saveChanges as string }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
  });

  it('shows an inline error when the create response lacks an id', async () => {
    global.fetch = vi.fn(async () => json({ ok: true }));
    const onSaved = vi.fn();
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={null} onClose={vi.fn()} onSaved={onSaved} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    await user.type(within(dialog).getByPlaceholderText(t.places.namePlaceholder as string), 'No Id');
    await user.click(within(dialog).getByRole('button', { name: t.places.saveChanges as string }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('rejects a save with only one coordinate filled', async () => {
    const fetchSpy = vi.fn(async () => json({ id: 1 }));
    global.fetch = fetchSpy;
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={null} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    await user.type(within(dialog).getByPlaceholderText(t.places.namePlaceholder as string), 'Coord Test');
    await user.type(within(dialog).getByPlaceholderText('35.6894'), '999');
    await user.click(within(dialog).getByRole('button', { name: t.places.saveChanges as string }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(t.places.invalidCoordinates as string);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does nothing for blank geocode searches after consent is enabled', async () => {
    grantConsent();
    const fetchSpy = vi.fn(async () => json([]));
    global.fetch = fetchSpy;
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={null} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    await user.click(within(dialog).getByRole('button', { name: t.places.geocodeButton as string }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('drops geocode results when consent is revoked before completion', async () => {
    grantConsent();
    const pending = deferred<Response>();
    global.fetch = vi.fn(() => pending.promise);
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={null} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    await user.type(within(dialog).getAllByPlaceholderText(t.places.addressPlaceholder as string)[1], 'stale');
    await user.click(within(dialog).getByRole('button', { name: t.places.geocodeButton as string }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await user.click(within(dialog).getByRole('button', { name: t.map.externalPrivacyDisable as string }));
    pending.resolve(json([{ display_name: 'Late Place', lat: '1', lon: '2' }]));
    await pending.promise;
    await Promise.resolve();
    expect(within(dialog).queryByText('Late Place')).toBeNull();
  });

  it('ignores geocode failures after consent revocation aborts the request', async () => {
    grantConsent();
    const pending = deferred<Response>();
    global.fetch = vi.fn(() => pending.promise);
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={null} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    await user.type(within(dialog).getAllByPlaceholderText(t.places.addressPlaceholder as string)[1], 'abort');
    await user.click(within(dialog).getByRole('button', { name: t.places.geocodeButton as string }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await user.click(within(dialog).getByRole('button', { name: t.map.externalPrivacyDisable as string }));
    pending.reject(new Error('late geocode failure'));
    await Promise.resolve();
    expect(within(dialog).queryByText(t.places.geocodeError as string)).toBeNull();
  });

  it('drops save results after the edited place identity changes', async () => {
    const pending = deferred<Response>();
    global.fetch = vi.fn(() => pending.promise);
    const onSaved = vi.fn();
    const rendered = renderWithProviders(
      <AddEditPlaceModal place={place()} onClose={vi.fn()} onSaved={onSaved} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    await rendered.user.type(within(dialog).getByPlaceholderText(t.places.namePlaceholder as string), ' stale');
    await rendered.user.click(within(dialog).getByRole('button', { name: t.places.saveChanges as string }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    rendered.rerender(<AddEditPlaceModal place={place({ id: 4, name: 'Other Shop' })} onClose={vi.fn()} onSaved={onSaved} />);
    pending.resolve(json({ ok: true }));
    await pending.promise;
    await Promise.resolve();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('drops stale create results after the modal identity changes', async () => {
    const pending = deferred<Response>();
    global.fetch = vi.fn(() => pending.promise);
    const onSaved = vi.fn();
    const rendered = renderWithProviders(
      <AddEditPlaceModal place={null} initialBranch="First Branch" onClose={vi.fn()} onSaved={onSaved} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    await rendered.user.click(within(dialog).getByRole('button', { name: t.places.saveChanges as string }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    rendered.rerender(<AddEditPlaceModal place={null} initialBranch="Second Branch" onClose={vi.fn()} onSaved={onSaved} />);
    pending.resolve(json({ id: 92 }));
    await pending.promise;
    await Promise.resolve();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('ignores AbortError from a save aborted by unmount', async () => {
    global.fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      const pending = deferred<Response>();
      init?.signal?.addEventListener('abort', () => pending.reject(new DOMException('aborted', 'AbortError')), { once: true });
      return pending.promise;
    });
    const rendered = renderWithProviders(
      <AddEditPlaceModal place={place()} onClose={vi.fn()} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    await rendered.user.type(within(dialog).getByPlaceholderText(t.places.namePlaceholder as string), ' abort');
    await rendered.user.click(within(dialog).getByRole('button', { name: t.places.saveChanges as string }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    rendered.unmount();
    await Promise.resolve();
  });

  it('does not close while a save is in flight', async () => {
    const pending = deferred<Response>();
    global.fetch = vi.fn(() => pending.promise);
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={place()} onClose={onClose} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    await user.type(within(dialog).getByPlaceholderText(t.places.namePlaceholder as string), ' saving');
    await user.click(within(dialog).getByRole('button', { name: t.places.saveChanges as string }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await user.click(within(dialog).getByRole('button', { name: t.places.cancel as string }));
    expect(onClose).not.toHaveBeenCalled();
    pending.resolve(json({ ok: true }));
  });

  it('does not close a dirty form if identity changes while discard confirmation is open', async () => {
    const onClose = vi.fn();
    const rendered = renderWithProviders(
      <AddEditPlaceModal place={null} initialBranch="First" onClose={onClose} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    await rendered.user.type(within(dialog).getByPlaceholderText(t.places.namePlaceholder as string), ' Dirty');
    await rendered.user.click(within(dialog).getByRole('button', { name: t.places.cancel as string }));
    const confirmBox = await screen.findByRole('alertdialog');
    rendered.rerender(<AddEditPlaceModal place={null} initialBranch="Second" onClose={onClose} onSaved={vi.fn()} />);
    await rendered.user.click(within(confirmBox).getByRole('button', { name: 'Confirm' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes immediately via the header button when the form is pristine', async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={place()} onClose={onClose} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    await user.click(within(dialog).getByRole('button', { name: t.common.close as string }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('confirms discard before closing a dirty form, and stays open on cancel', async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={null} onClose={onClose} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    await user.type(within(dialog).getByPlaceholderText(t.places.namePlaceholder as string), 'Dirty');
    await user.click(within(dialog).getByRole('button', { name: t.places.cancel as string }));

    const confirmBox = await screen.findByRole('alertdialog');
    await user.click(within(confirmBox).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('discards and closes a dirty form once the discard is confirmed', async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(
      <AddEditPlaceModal place={null} onClose={onClose} onSaved={vi.fn()} />,
      { locale: 'en' },
    );
    const dialog = getDialog();
    await user.type(within(dialog).getByPlaceholderText(t.places.namePlaceholder as string), 'Dirty');
    await user.click(within(dialog).getByRole('button', { name: t.places.cancel as string }));
    const confirmBox = await screen.findByRole('alertdialog');
    await user.click(within(confirmBox).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
