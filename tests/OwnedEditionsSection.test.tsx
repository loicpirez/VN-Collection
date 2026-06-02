// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { OwnedEditionsSection } from '@/components/OwnedEditionsSection';
import { OWNED_EDITIONS_EVENT } from '@/components/ReleaseOwnedToggle';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { OwnedEditionClientRow } from '@/lib/vn-detail-client-shape';
import type { VndbRelease } from '@/lib/vndb-types';

const nav = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.searchParams,
  usePathname: () => '/vn/v90001',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({
    src,
    localSrc,
    alt,
    className,
  }: {
    src: string | null;
    localSrc?: string | null;
    alt: string;
    className?: string;
  }) => <img alt={alt} data-src={src ?? localSrc ?? ''} className={className} />,
}));

vi.mock('@/components/LangFlag', () => ({
  LangFlag: ({ lang, className }: { lang: string; className?: string }) => (
    <span className={className}>{lang.toUpperCase()}</span>
  ),
}));

vi.mock('@/components/DateInput', () => ({
  DateInput: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (value: string) => void;
    ariaLabel?: string;
  }) => (
    <input
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}));

vi.mock('@/components/TagInput', () => ({
  TagInput: ({
    values,
    onChange,
    placeholder,
  }: {
    values: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
  }) => (
    <input
      aria-label={placeholder}
      value={values.join(', ')}
      onChange={(event) => {
        onChange(
          event.currentTarget.value
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        );
      }}
    />
  ),
}));

const useSectionCountMock = vi.fn();

vi.mock('@/components/vn-detail/DetailSectionFrame', () => ({
  useSectionCount: (count: number | null) => useSectionCountMock(count),
}));

const t = dictionaries.en;
const VN_ID = 'v90001';
const originalFetch = global.fetch;

function json<T>(payload: T, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function release(id: string, overrides: Partial<VndbRelease> = {}): VndbRelease {
  return {
    id,
    title: `Release ${id.slice(1)}`,
    alttitle: null,
    languages: [{ lang: 'ja', title: null, latin: null, mtl: false, main: true }],
    platforms: ['win'],
    media: [{ medium: 'dvd', qty: 1 }],
    released: '2024-01-02',
    minage: 18,
    patch: false,
    freeware: false,
    uncensored: null,
    official: true,
    has_ero: true,
    resolution: [1280, 720],
    engine: null,
    voiced: null,
    notes: null,
    gtin: null,
    catalog: null,
    producers: [
      {
        id: 'p90001',
        developer: true,
        publisher: false,
        name: 'Developer A',
      },
      {
        id: 'p90002',
        developer: false,
        publisher: true,
        name: 'Publisher A',
      },
    ],
    extlinks: [],
    vns: [{ id: VN_ID, rtype: 'complete', title: 'Parent VN' }],
    images: [],
    ...overrides,
  };
}

function ownedRow(releaseId: string, overrides: Partial<OwnedEditionClientRow> = {}): OwnedEditionClientRow {
  return {
    vn_id: VN_ID,
    release_id: releaseId,
    notes: null,
    location: 'unknown',
    physical_location: [],
    box_type: 'none',
    edition_label: null,
    condition: null,
    price_paid: null,
    currency: null,
    acquired_date: null,
    purchase_place: null,
    owned_platform: null,
    rel_platforms: [],
    dumped: false,
    added_at: 1_700_000_000,
    shelf: null,
    aspect: {
      width: null,
      height: null,
      raw_resolution: null,
      aspect_key: 'unknown',
      source: 'unknown',
      note: null,
    },
    ...overrides,
  };
}

interface PatchBody extends Partial<OwnedEditionClientRow> {
  release_id?: string;
  aspect_override?: {
    width: number | null;
    height: number | null;
    aspect_key: string | null;
    note?: string | null;
  } | null;
}

interface TestServerState {
  owned: OwnedEditionClientRow[];
  releases: VndbRelease[];
  knownPlaces: string[];
  failOwned?: boolean;
  failPlaces?: boolean;
  failPost?: boolean;
  failPatch?: boolean;
  malformedPatch?: boolean;
  failDelete?: boolean;
}

function parseBody(init: RequestInit | undefined): PatchBody {
  if (typeof init?.body !== 'string') return {};
  const parsed: PatchBody = JSON.parse(init.body);
  return parsed;
}

function rowFromReleaseId(releaseId: string, releases: VndbRelease[]): OwnedEditionClientRow {
  const matched = releases.find((candidate) => candidate.id === releaseId);
  if (!matched?.resolution) {
    return ownedRow(releaseId, {
      rel_platforms: matched?.platforms ?? [],
    });
  }
  return ownedRow(releaseId, {
    rel_platforms: matched?.platforms ?? [],
    aspect: {
      width: Array.isArray(matched.resolution) ? matched.resolution[0] : null,
      height: Array.isArray(matched.resolution) ? matched.resolution[1] : null,
      raw_resolution: Array.isArray(matched.resolution) ? `${matched.resolution[0]}x${matched.resolution[1]}` : matched.resolution,
      aspect_key: '16:9',
      source: 'vndb',
      note: null,
    },
  });
}

function applyPatch(row: OwnedEditionClientRow, patch: PatchBody): OwnedEditionClientRow {
  const patched: OwnedEditionClientRow = {
    ...row,
    notes: patch.notes === undefined ? row.notes : patch.notes ?? null,
    location: patch.location === undefined ? row.location : patch.location,
    physical_location: patch.physical_location === undefined ? row.physical_location : patch.physical_location,
    box_type: patch.box_type === undefined ? row.box_type : patch.box_type,
    edition_label: patch.edition_label === undefined ? row.edition_label : patch.edition_label ?? null,
    condition: patch.condition === undefined ? row.condition : patch.condition ?? null,
    price_paid: patch.price_paid === undefined ? row.price_paid : patch.price_paid ?? null,
    currency: patch.currency === undefined ? row.currency : patch.currency ?? null,
    acquired_date: patch.acquired_date === undefined ? row.acquired_date : patch.acquired_date ?? null,
    purchase_place: patch.purchase_place === undefined ? row.purchase_place : patch.purchase_place ?? null,
    owned_platform: patch.owned_platform === undefined ? row.owned_platform : patch.owned_platform ?? null,
    dumped: patch.dumped === undefined ? row.dumped : patch.dumped,
  };
  const override = patch.aspect_override;
  if (override === null) {
    return {
      ...patched,
      aspect: {
        width: null,
        height: null,
        raw_resolution: null,
        aspect_key: 'unknown',
        source: 'unknown',
        note: null,
      },
    };
  }
  if (override?.width && override.height) {
    return {
      ...patched,
      aspect: {
        width: override.width,
        height: override.height,
        raw_resolution: `${override.width}x${override.height}`,
        aspect_key: '16:9',
        source: 'manual',
        note: override.note ?? null,
      },
    };
  }
  if (override?.aspect_key) {
    return {
      ...patched,
      aspect: {
        width: null,
        height: null,
        raw_resolution: null,
        aspect_key: override.aspect_key as OwnedEditionClientRow['aspect']['aspect_key'],
        source: 'manual',
        note: override.note ?? null,
      },
    };
  }
  return patched;
}

function installFetchServer(state: TestServerState) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    if (url === `/api/collection/${VN_ID}/owned-releases` && method === 'GET') {
      return state.failOwned ? json({ error: 'owned failed' }, 500) : json({ owned: state.owned });
    }
    if (url === `/api/vn/${VN_ID}/releases` && method === 'GET') {
      return json({ releases: state.releases });
    }
    if (url === '/api/places' && method === 'GET') {
      if (state.failPlaces) return json({ error: 'places failed' }, 500);
      return json({ known_places: state.knownPlaces });
    }
    if (url === `/api/collection/${VN_ID}/owned-releases` && method === 'POST') {
      if (state.failPost) return json({ error: 'add failed' }, 500);
      const body = parseBody(init);
      if (body.release_id) state.owned = [rowFromReleaseId(body.release_id, state.releases), ...state.owned];
      return json({ ok: true });
    }
    if (url === `/api/collection/${VN_ID}/owned-releases` && method === 'PATCH') {
      if (state.failPatch) return json({ error: 'save failed' }, 500);
      const body = parseBody(init);
      state.owned = state.owned.map((row) => row.release_id === body.release_id ? applyPatch(row, body) : row);
      if (state.malformedPatch) return json({ owned: [{ release_id: 42 }] });
      return json({ owned: state.owned });
    }
    if (url.startsWith(`/api/collection/${VN_ID}/owned-releases?`) && method === 'DELETE') {
      if (state.failDelete) return json({ error: 'delete failed' }, 500);
      const parsed = new URL(url, 'http://localhost');
      const releaseId = parsed.searchParams.get('release_id');
      state.owned = state.owned.filter((row) => row.release_id !== releaseId);
      return json({ ok: true });
    }
    return json({ error: `unexpected ${method} ${url}` }, 404);
  });
  global.fetch = fetchMock;
  return fetchMock;
}

async function renderLoaded(state: TestServerState) {
  const fetchMock = installFetchServer(state);
  const rendered = renderWithProviders(
    <OwnedEditionsSection
      vnId={VN_ID}
      parentVnTitle="Parent VN"
      parentVnCover={{ url: '/parent.jpg', localPath: '/local-parent.jpg', sexual: 0 }}
    />,
    { locale: 'en' },
  );
  await screen.findByRole('button', { name: t.inventory.addEdition });
  return { ...rendered, fetchMock };
}

describe('OwnedEditionsSection', () => {
  beforeEach(() => {
    nav.searchParams = new URLSearchParams();
    useSectionCountMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders release-backed edition summaries with fallback cover, shelf placement, and metadata fields', async () => {
    await renderLoaded({
      owned: [
        ownedRow('r90001', {
          edition_label: 'First print box',
          location: 'jp',
          physical_location: ['Akiba shelf', 'Storage B'],
          box_type: 'special_edition',
          condition: 'sealed',
          price_paid: 12345,
          currency: 'JPY',
          acquired_date: '2024-05-01',
          purchase_place: 'Shop A',
          owned_platform: 'win',
          rel_platforms: ['win', 'ps5'],
          dumped: true,
          notes: 'Keep the drama CD inside.',
          shelf: { kind: 'cell', id: 7, name: 'Shelf A', row: 1, col: 2 },
          aspect: {
            width: 1280,
            height: 720,
            raw_resolution: '1280x720',
            aspect_key: '16:9',
            source: 'manual',
            note: null,
          },
        }),
      ],
      releases: [release('r90001')],
      knownPlaces: ['Akiba shelf'],
    });

    expect(screen.getByRole('link', { name: 'Release 90001' })).toBeTruthy();
    expect(screen.getByAltText('Release 90001')).toHaveAttribute('data-src', '/parent.jpg');
    expect(screen.getByText('First print box')).toBeTruthy();
    expect(screen.getAllByText('Windows').length).toBeGreaterThan(0);
    expect(screen.getByText(t.locations.jp)).toBeTruthy();
    expect(screen.getByText(t.boxTypes.special_edition)).toBeTruthy();
    expect(screen.getByText(t.inventory.conditions.sealed)).toBeTruthy();
    expect(screen.getByText('12,345 JPY')).toBeTruthy();
    expect(screen.getByText('Shop A')).toBeTruthy();
    expect(screen.getByText('Akiba shelf')).toHaveAttribute('href', '/?place=Akiba%20shelf');
    expect(screen.getByText('Storage B')).toHaveAttribute('href', '/?place=Storage%20B');
    expect(screen.getByText('Shelf A')).toBeTruthy();
    expect(screen.getByText(`1280x720 / ${t.aspect.keys['16:9']} (${t.aspect.manual})`)).toBeTruthy();
    expect(screen.getByText('Keep the drama CD inside.')).toBeTruthy();
    expect(useSectionCountMock).toHaveBeenCalledWith(1);
  });

  it('renders ambiguous platform summaries, display shelf placement, VNDB aspect source, and release cover priority', async () => {
    await renderLoaded({
      owned: [
        ownedRow('r90002', {
          rel_platforms: ['win', 'ps5'],
          shelf: { kind: 'display', id: 8, name: 'Display A', afterRow: 1, position: 2 },
          aspect: {
            width: 1920,
            height: 1080,
            raw_resolution: '1920x1080',
            aspect_key: '16:9',
            source: 'vndb',
            note: null,
          },
        }),
      ],
      releases: [
        release('r90002', {
          images: [
            { id: 'cv90002b', url: '/pkg-back.jpg', type: 'pkgback', sexual: 0 },
            { id: 'cv90002f', url: '/pkg-front.jpg', type: 'pkgfront', sexual: 0 },
          ],
        }),
      ],
      knownPlaces: [],
    });

    expect(screen.getByAltText('Release 90002')).toHaveAttribute('data-src', '/pkg-front.jpg');
    expect(screen.getByText(t.shelfLayout.platformChooseLabel)).toBeTruthy();
    expect(screen.getByText('Display A')).toBeTruthy();
    expect(screen.getByText(`${t.shelfLayout.frontDisplay} / 3`)).toBeTruthy();
    expect(screen.getByText(`1920x1080 / ${t.aspect.keys['16:9']} (${t.aspect.vndb})`)).toBeTruthy();
  });

  it('opens the release picker, paginates, filters, resets, and adds a selected release', async () => {
    const releases = Array.from({ length: 41 }, (_value, index) => {
      const id = `r9${String(index + 1).padStart(4, '0')}`;
      return release(id, {
        title: `Picker release ${index + 1}`,
        alttitle: index === 40 ? 'Final alternate title' : null,
        languages: [
          { lang: index === 40 ? 'en' : 'ja', title: null, latin: null, mtl: index === 40, main: true },
        ],
        platforms: index === 40 ? ['swi'] : ['win'],
        patch: index === 40,
        official: index !== 40,
        freeware: index === 40,
        uncensored: index === 40,
        has_ero: index !== 40,
        resolution: index === 40 ? '1024x768' : [1280, 720],
        producers: [{ id: 'p90001', developer: true, publisher: true, name: index === 40 ? 'Final Studio' : 'Studio A' }],
        images: index === 40
          ? [{ id: 'cv90041', url: '/release-41.jpg', type: 'pkgfront', sexual: 0 }]
          : [],
      });
    });
    const { fetchMock } = await renderLoaded({ owned: [], releases, knownPlaces: [] });

    fireEvent.click(screen.getByRole('button', { name: t.inventory.addEdition }));
    expect(screen.getByText('Picker release 1')).toBeTruthy();
    expect(screen.queryByText('Picker release 41')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: t.inventory.pickerNext }));
    expect(screen.getByText('Picker release 41')).toBeTruthy();
    expect(screen.getByText(t.releases.freeware)).toBeTruthy();
    expect(screen.getByText(t.releases.uncensored)).toBeTruthy();
    expect(screen.getByText('1024x768')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: t.inventory.pickerPrevious }));
    expect(screen.getByText('Picker release 1')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(t.inventory.pickerSearchPlaceholder), {
      target: { value: 'Final alternate' },
    });
    expect(screen.getByText('Final alternate title')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(t.inventory.pickerFilterLang), { target: { value: 'en' } });
    fireEvent.change(screen.getByLabelText(t.inventory.pickerFilterPlatform), { target: { value: 'swi' } });
    fireEvent.change(screen.getByLabelText(t.inventory.pickerFilterType), { target: { value: 'patch' } });
    fireEvent.change(screen.getByLabelText(t.inventory.pickerFilterEro), { target: { value: 'noero' } });
    fireEvent.change(screen.getByLabelText(t.inventory.pickerFilterMtl), { target: { value: 'mtl' } });
    expect(screen.getByText('Final Studio')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(t.inventory.pickerSearchPlaceholder), {
      target: { value: 'not present in the release list' },
    });
    expect(screen.getByText(t.inventory.pickerNoResults)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: t.inventory.pickerFilterReset }));
    expect(screen.getByText('Picker release 1')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(t.inventory.pickerSearchPlaceholder), {
      target: { value: 'Picker release 41' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Picker release 41/ }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(postCall).toBeDefined();
    expect(parseBody(postCall?.[1]).release_id).toBe('r90041');
    expect(await screen.findByRole('button', { name: t.common.save })).toBeTruthy();
  });

  it('adds and renders a synthetic edition when no VNDB releases are available', async () => {
    const { fetchMock } = await renderLoaded({ owned: [], releases: [], knownPlaces: [] });

    fireEvent.click(screen.getByRole('button', { name: t.inventory.addEdition }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.inventory.syntheticTitle) }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
    });
    expect(await screen.findByTitle(t.inventory.syntheticTitle)).toBeTruthy();
    expect(screen.queryByTitle(t.releases.viewDetails)).toBeNull();
  });

  it('saves locked single-platform editions and aspect bucket overrides', async () => {
    const { fetchMock } = await renderLoaded({
      owned: [
        ownedRow('r90001', {
          rel_platforms: ['win'],
        }),
      ],
      releases: [release('r90001')],
      knownPlaces: [],
    });

    fireEvent.click(screen.getByRole('button', { name: t.common.edit }));
    expect(screen.getByText(t.form.ownedPlatformLocked)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(t.aspect.bucket), { target: { value: '21:9' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true);
    });
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(parseBody(patchCall?.[1])).toMatchObject({
      release_id: 'r90001',
      owned_platform: 'win',
      aspect_override: { width: null, height: null, aspect_key: '21:9' },
    });
    await waitFor(() => {
      expect(screen.getAllByText('Windows').length).toBeGreaterThan(0);
    });
  });

  it('cancels and then saves free-text platforms for editions without release platform metadata', async () => {
    const { fetchMock } = await renderLoaded({
      owned: [ownedRow('synthetic:v90001')],
      releases: [],
      knownPlaces: [],
    });

    fireEvent.click(screen.getByRole('button', { name: t.common.edit }));
    fireEvent.change(screen.getByLabelText(t.form.ownedPlatform), { target: { value: 'SWI' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.cancel }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: t.common.edit }));
    fireEvent.change(screen.getByLabelText(t.form.ownedPlatform), { target: { value: 'SWI' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true);
    });
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(parseBody(patchCall?.[1]).owned_platform).toBe('swi');
    expect(await screen.findByText('Nintendo Switch')).toBeTruthy();
  });

  it('opens a deep-linked editor, validates bad values locally, and PATCHes normalized edit fields', async () => {
    nav.searchParams = new URLSearchParams('edit_release=r90001');
    const { fetchMock } = await renderLoaded({
      owned: [
        ownedRow('r90001', {
          rel_platforms: ['win', 'ps5'],
          aspect: {
            width: 1024,
            height: 768,
            raw_resolution: '1024x768',
            aspect_key: '4:3',
            source: 'vndb',
            note: null,
          },
        }),
      ],
      releases: [release('r90001', { platforms: ['win', 'ps5'] })],
      knownPlaces: ['Shelf C'],
    });

    expect(await screen.findByRole('button', { name: t.common.save })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(t.inventory.pricePaid), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);

    fireEvent.change(screen.getByLabelText(t.inventory.pricePaid), { target: { value: '2345.5' } });
    fireEvent.change(screen.getByLabelText(t.aspect.width), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(t.aspect.height), { target: { value: '720' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);

    fireEvent.change(screen.getByLabelText(t.form.editionLabel), { target: { value: 'Updated limited box' } });
    fireEvent.change(screen.getByLabelText(t.form.ownedPlatform), { target: { value: 'ps5' } });
    fireEvent.change(screen.getByLabelText(t.form.location), { target: { value: 'jp' } });
    fireEvent.change(screen.getByLabelText(t.form.boxType), { target: { value: 'large' } });
    fireEvent.change(screen.getByLabelText(t.inventory.condition), { target: { value: 'used' } });
    fireEvent.change(screen.getByLabelText(t.inventory.currency), { target: { value: 'eur' } });
    fireEvent.change(screen.getByLabelText(t.inventory.acquired), { target: { value: '2024-06-02' } });
    fireEvent.change(screen.getByLabelText(t.inventory.purchasePlace), { target: { value: 'Shop B' } });
    fireEvent.change(screen.getByLabelText(t.form.physicalLocationPlaceholder), { target: { value: 'Shelf C, Shelf D' } });
    fireEvent.change(screen.getByLabelText(t.inventory.notes), { target: { value: 'Updated notes' } });
    fireEvent.change(screen.getByLabelText(t.aspect.width), { target: { value: '1280' } });
    fireEvent.change(screen.getByLabelText(t.aspect.height), { target: { value: '720' } });
    fireEvent.click(screen.getByLabelText(t.form.dumped));
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true);
    });
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    const patch = parseBody(patchCall?.[1]);
    expect(patch).toMatchObject({
      release_id: 'r90001',
      edition_label: 'Updated limited box',
      owned_platform: 'ps5',
      location: 'jp',
      box_type: 'large',
      condition: 'used',
      price_paid: 2345.5,
      currency: 'EUR',
      acquired_date: '2024-06-02',
      purchase_place: 'Shop B',
      physical_location: ['Shelf C', 'Shelf D'],
      notes: 'Updated notes',
      dumped: true,
      aspect_override: { width: 1280, height: 720, aspect_key: null },
    });
    expect(await screen.findByText('Updated limited box')).toBeTruthy();
    expect(screen.getAllByText('PlayStation 5').length).toBeGreaterThan(0);
  });

  it('keeps an edition after canceling removal and removes it after confirmation', async () => {
    const { fetchMock } = await renderLoaded({
      owned: [ownedRow('r90001')],
      releases: [release('r90001')],
      knownPlaces: [],
    });

    fireEvent.click(screen.getByRole('button', { name: t.common.delete }));
    expect(await screen.findByText(t.inventory.removeConfirm)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.common.cancel }));
    expect(screen.getByRole('link', { name: 'Release 90001' })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.getByRole('button', { name: t.common.delete })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: t.common.delete }));
    fireEvent.click(await screen.findByRole('button', { name: t.common.confirm }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(true);
    });
    expect(await screen.findByText(t.inventory.empty)).toBeTruthy();
  });

  it('surfaces add, save, malformed-save, delete, and optional places failures without corrupting visible rows', async () => {
    const state: TestServerState = {
      owned: [ownedRow('r90001')],
      releases: [release('r90001'), release('r90002')],
      knownPlaces: [],
      failPlaces: true,
      failPost: true,
    };
    const { fetchMock } = await renderLoaded(state);

    fireEvent.click(screen.getByRole('button', { name: t.inventory.addEdition }));
    fireEvent.click(screen.getByRole('button', { name: /Release 90002/ }));
    expect(await screen.findByText('add failed')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Release 90001' })).toBeTruthy();

    state.failPost = false;
    state.failPatch = true;
    fireEvent.click(screen.getByRole('button', { name: t.common.edit }));
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    expect(await screen.findByText('save failed')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true);

    state.failPatch = false;
    state.malformedPatch = true;
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    expect(await screen.findByText(t.common.error)).toBeTruthy();

    state.malformedPatch = false;
    state.failDelete = true;
    fireEvent.click(screen.getByRole('button', { name: t.common.delete }));
    fireEvent.click(await screen.findByRole('button', { name: t.common.confirm }));
    expect(await screen.findByText('delete failed')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Release 90001' })).toBeTruthy();
  });

  it('reloads after external owned-edition events and leaves optional failures silent', async () => {
    const state: TestServerState = {
      owned: [],
      releases: [release('r90001')],
      knownPlaces: [],
      failOwned: true,
    };
    const { fetchMock } = await renderLoaded(state);
    expect(await screen.findByText(t.inventory.empty)).toBeTruthy();

    state.failOwned = false;
    state.owned = [ownedRow('r90001')];
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(OWNED_EDITIONS_EVENT, {
          detail: { vnId: VN_ID, releaseId: 'r90001', isNowOwned: true },
        }),
      );
      await Promise.resolve();
    });

    expect(await screen.findByRole('link', { name: 'Release 90001' })).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]) => url === `/api/collection/${VN_ID}/owned-releases`).length).toBeGreaterThan(1);
  });
});
