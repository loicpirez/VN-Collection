import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToReadableStream } from 'react-dom/server';
import VnDetail, { generateMetadata } from '@/app/vn/[id]/page';
import {
  deriveVnAspectDisplay,
  deriveVnAspectKey,
  getAppSetting,
  getCollectionItem,
  getCoOccurringTags,
  getEgsForVn,
  getSourcePref,
  getVnAspectOverride,
  isInCollection,
  isInCollectionMany,
  listActivityForVn,
  listGameLogForVn,
  listListsForVn,
  listSeries,
  materializeReleaseAspectsForVn,
  materializeReleaseMetaForVn,
  upsertVn,
  type EgsRow,
  type VnAspectDisplay,
} from '@/lib/db';
import { getVn, type VndbVn } from '@/lib/vndb';
import { detectSeriesForVn, type SeriesSuggestion } from '@/lib/series-detect';
import { isCacheFresh } from '@/lib/cache-age';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { VnSectionId } from '@/lib/vn-detail-layout';
import type { CollectionItem } from '@/lib/types';

const dynamicMocks = vi.hoisted(() => ({
  loads: [] as Array<Promise<object>>,
}));

vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<object>, options: { loading: () => React.ReactNode }) => {
    dynamicMocks.loads.push(loader());
    return (props: Record<string, string | number | boolean | null | undefined>) => (
      <div data-dynamic={JSON.stringify(props)}>{options.loading()}</div>
    );
  },
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('next/server', () => ({
  after: vi.fn((callback: () => void) => callback()),
}));

vi.mock('@/lib/db', () => ({
  deriveVnAspectDisplay: vi.fn(),
  deriveVnAspectKey: vi.fn(),
  getAppSetting: vi.fn(),
  getCollectionItem: vi.fn(),
  getCoOccurringTags: vi.fn(),
  getEgsForVn: vi.fn(),
  getSourcePref: vi.fn(),
  getVnAspectOverride: vi.fn(),
  isEgsOnly: (id: string) => id.startsWith('egs_'),
  isInCollection: vi.fn(),
  isInCollectionMany: vi.fn(),
  listActivityForVn: vi.fn(),
  listGameLogForVn: vi.fn(),
  listListsForVn: vi.fn(),
  listSeries: vi.fn(),
  materializeReleaseAspectsForVn: vi.fn(),
  materializeReleaseMetaForVn: vi.fn(),
  upsertVn: vi.fn(),
}));

vi.mock('@/lib/vndb', () => ({
  getVn: vi.fn(),
}));

vi.mock('@/lib/series-detect', () => ({
  detectSeriesForVn: vi.fn(),
}));

vi.mock('@/lib/cache-age', () => ({
  VNDB_CACHE_MS: 1,
  isCacheFresh: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/components/VnDetailLayout', () => ({
  VnDetailLayout: ({ sectionNodes, vnId }: { sectionNodes: Partial<Record<VnSectionId, React.ReactNode>>; vnId: string }) => (
    <div data-layout={vnId}>
      {Object.entries(sectionNodes).map(([id, node]) => <section key={id} data-section={id}>{node}</section>)}
    </div>
  ),
}));

vi.mock('@/components/Skeleton', () => ({
  SkeletonBlock: ({ className }: { className?: string }) => <div data-skeleton-block={className ?? ''} />,
  SkeletonRows: ({ count, withThumb }: { count: number; withThumb?: boolean }) => <div>{`skeleton-rows:${count}:${withThumb ?? true}`}</div>,
}));

vi.mock('@/components/AspectOverrideControl', () => ({
  AspectOverrideControl: ({ initialDerived, initialOverride, vnId }: { initialDerived: string; initialOverride: object | null; vnId: string }) => (
    <div>{`aspect-control:${vnId}:${initialDerived}:${JSON.stringify(initialOverride)}`}</div>
  ),
}));

vi.mock('@/components/EditForm', () => ({
  EditForm: ({ inCollection, vn }: { inCollection: boolean; vn: CollectionItem }) => <div>{`edit:${vn.id}:${inCollection}`}</div>,
}));

vi.mock('@/components/StatusBadge', () => ({
  StatusBadge: ({ status }: { status: string }) => <div>{`status:${status}`}</div>,
}));

vi.mock('@/components/CoverUploader', () => ({
  CoverUploader: ({ hasCustom, vnId }: { hasCustom: boolean; vnId: string }) => <div>{`uploader:${vnId}:${hasCustom}`}</div>,
}));

vi.mock('@/components/HeroBanner', () => ({
  HeroBanner: ({ customBanner, src, vnId }: { customBanner: boolean; src: string | null; vnId: string }) => <div>{`banner:${vnId}:${src ?? 'none'}:${customBanner}`}</div>,
}));

vi.mock('@/components/CastSection', () => ({
  CastSection: ({ va }: { va: CollectionItem['va'] }) => <div>{`cast:${va.length}`}</div>,
}));

vi.mock('@/components/StaffSection', () => ({
  StaffSection: ({ staff }: { staff: CollectionItem['staff'] }) => <div>{`staff:${staff.length}`}</div>,
}));

vi.mock('@/components/TagCoOccurrence', () => ({
  TagCoOccurrence: ({ rows }: { rows: Array<{ id: string }> }) => <div>{`tag-overlap:${rows.length}`}</div>,
}));

vi.mock('@/components/ReadingSpeedBadge', () => ({
  ReadingSpeedBadge: ({ vndbLength }: { vndbLength: number | null }) => <div>{`speed:${vndbLength ?? 'none'}`}</div>,
}));

vi.mock('@/components/ActivityTimeline', () => ({
  ActivityTimeline: ({ initial, vnId }: { initial: object[]; vnId: string }) => <div>{`activity:${vnId}:${initial.length}`}</div>,
}));

vi.mock('@/components/SeriesAutoSuggest', () => ({
  SeriesAutoSuggest: ({ vnId }: { vnId: string }) => <div>{`series-suggest:${vnId}`}</div>,
}));

vi.mock('@/components/SessionPanel', () => ({
  SessionPanel: ({ initialLog, vnId }: { initialLog: object[]; vnId: string }) => <div>{`session:${vnId}:${initialLog.length}`}</div>,
}));

vi.mock('@/components/CoverEditOverlay', () => ({
  CoverEditOverlay: ({ vnId }: { vnId: string }) => <div>{`cover-edit:${vnId}`}</div>,
}));

vi.mock('@/components/CoverHero', () => ({
  CoverHero: ({ initialLocal, initialRemote, vnId }: { initialLocal: string | null; initialRemote: string | null; vnId: string }) => (
    <div>{`cover-hero:${vnId}:${initialRemote ?? 'none'}:${initialLocal ?? 'none'}`}</div>
  ),
}));

vi.mock('@/components/CoverRotationButtons', () => ({
  CoverRotationButtons: ({ vnId }: { vnId: string }) => <div>{`cover-rotation:${vnId}`}</div>,
}));

vi.mock('@/components/VnListMemberships', () => ({
  VnListMemberships: ({ lists, vnId }: { lists: Array<{ name: string }>; vnId: string }) => <div>{`lists:${vnId}:${lists.map((list) => list.name).join(',')}`}</div>,
}));

vi.mock('@/components/PlaytimeCompare', () => ({
  PlaytimeCompare: ({ current, vnId }: { current: string; vnId: string }) => <div>{`playtime:${vnId}:${current}`}</div>,
}));

vi.mock('@/components/SmartStatusHint', () => ({
  SmartStatusHint: ({ vnId }: { vnId: string }) => <div>{`smart-status:${vnId}`}</div>,
}));

vi.mock('@/components/VnDetailActionsBar', () => ({
  VnDetailActionsBar: ({ imageSourcePref, inCollection, vn }: { imageSourcePref: string; inCollection: boolean; vn: CollectionItem }) => (
    <div>{`actions:${vn.id}:${inCollection}:${imageSourcePref}`}</div>
  ),
}));

vi.mock('@/components/NotesSectionToggle', () => ({
  NotesSectionToggle: ({ notes }: { notes?: string | null }) => <div>{`notes:${notes ?? 'none'}`}</div>,
}));

vi.mock('@/components/ScoreSection', () => ({
  ScoreSection: ({ unifiedRating, unifiedRatingSource }: { unifiedRating: number | null; unifiedRatingSource: string }) => (
    <div>{`score:${unifiedRating ?? 'none'}:${unifiedRatingSource}`}</div>
  ),
}));

vi.mock('@/components/OwnedEditionsSection', () => ({
  OwnedEditionsSection: ({ vnId }: { vnId: string }) => <div>{`editions:${vnId}`}</div>,
}));

vi.mock('@/components/LangFlag', () => ({
  LangList: ({ langs }: { langs: string[] }) => <div>{`langs:${langs.join(',')}`}</div>,
}));

vi.mock('@/components/RelationsSection', () => ({
  RelationsSection: ({ relations }: { relations: Array<{ id: string; in_collection: boolean }> }) => (
    <div>{`relations:${relations.map((relation) => `${relation.id}-${relation.in_collection}`).join(',')}`}</div>
  ),
}));

vi.mock('@/components/RecordRecentView', () => ({
  RecordRecentView: ({ id }: { id: string }) => <div>{`recent:${id}`}</div>,
}));

vi.mock('@/components/NotInCollectionBanner', () => ({
  NotInCollectionBanner: ({ vnId }: { vnId: string }) => <div>{`not-in-collection:${vnId}`}</div>,
}));

vi.mock('@/components/TitleLine', () => ({
  TitleLine: ({ alttitle, title }: { alttitle?: string; title: string }) => <div>{`title:${title}:${alttitle ?? 'none'}`}</div>,
}));

vi.mock('@/components/EgsPanel', () => ({
  EgsPanel: ({ initialGame, searchSeed, vnId }: { initialGame: { id: number } | null; searchSeed: string; vnId: string }) => (
    <div>{`egs-panel:${vnId}:${initialGame?.id ?? 'none'}:${searchSeed}`}</div>
  ),
}));

vi.mock('@/components/EgsRichDetails', () => ({
  EgsRichDetails: ({ vnId }: { vnId: string }) => <div>{`egs-details:${vnId}`}</div>,
}));

vi.mock('@/components/MatchBadges', () => ({
  MatchBadges: ({ egsOnly }: { egsOnly: boolean }) => <div>{`match:${egsOnly}`}</div>,
}));

vi.mock('@/components/VndbStatusPanel', () => ({
  VndbStatusPanel: ({ vnId }: { vnId: string }) => <div>{`vndb-status:${vnId}`}</div>,
}));

vi.mock('@/components/FieldCompare', () => ({
  FieldCompare: ({ egsLinked, vnId }: { egsLinked: boolean; vnId: string }) => <div>{`field-compare:${vnId}:${egsLinked}`}</div>,
}));

vi.mock('@/components/CustomSynopsis', () => ({
  CustomSynopsis: ({ fallback, initial, vnId }: { fallback: React.ReactNode; initial: string | null; vnId: string }) => (
    <div>{`custom-synopsis:${vnId}:${initial ?? 'none'}`}{fallback}</div>
  ),
}));

vi.mock('@/components/BrandCompare', () => ({
  BrandCompare: ({ egsBrand, vndbDevs, vnId }: { egsBrand: string | null; vndbDevs: Array<{ name: string }>; vnId: string }) => (
    <div>{`brand:${vnId}:${vndbDevs.map((dev) => dev.name).join(',')}:${egsBrand ?? 'none'}`}</div>
  ),
}));

vi.mock('@/components/CoverCompare', () => ({
  CoverCompare: ({ current, vnId }: { current: string; vnId: string }) => <div>{`cover-compare:${vnId}:${current}`}</div>,
}));

vi.mock('@/components/VnTagsGroupedView', () => ({
  VnTagsGroupedView: ({ spoilOverride, tags }: { spoilOverride: number | null; tags: CollectionItem['tags'] }) => (
    <div>{`tags:${tags.length}:${spoilOverride ?? 'none'}`}</div>
  ),
}));

vi.mock('@/components/MediaGallery', () => ({
  MediaGallery: () => <div />,
}));

vi.mock('@/components/CharactersSection', () => ({
  CharactersSection: () => <div />,
}));

vi.mock('@/components/RoutesSection', () => ({
  RoutesSection: () => <div />,
}));

vi.mock('@/components/QuotesSection', () => ({
  QuotesSection: () => <div />,
}));

vi.mock('@/components/ReleasesSection', () => ({
  ReleasesSection: () => <div />,
}));

function collectionItem(id: string, overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
    id,
    title: `VN ${id}`,
    alttitle: null,
    image_url: null,
    image_thumb: null,
    image_sexual: null,
    image_violence: null,
    released: null,
    olang: null,
    languages: [],
    platforms: [],
    length_minutes: null,
    length: null,
    rating: null,
    votecount: null,
    description: null,
    developers: [],
    publishers: [],
    tags: [],
    screenshots: [],
    release_images: [],
    local_image: null,
    local_image_thumb: null,
    custom_cover: null,
    banner_image: null,
    banner_position: null,
    cover_rotation: 0,
    banner_rotation: 0,
    relations: [],
    aliases: [],
    extlinks: [],
    length_votes: null,
    average: null,
    has_anime: null,
    devstatus: null,
    titles: [],
    editions: [],
    staff: [],
    va: [],
    fetched_at: 1,
    ...overrides,
  };
}

function vndbVn(id: string): VndbVn {
  return {
    id,
    title: `Fetched ${id}`,
    alttitle: null,
    olang: 'ja',
    released: null,
    languages: [],
    platforms: [],
    length: null,
    length_minutes: null,
    rating: null,
    votecount: null,
    description: null,
    image: null,
    developers: [],
    tags: [],
    screenshots: [],
  };
}

function egsRow(vnId: string, overrides: Partial<EgsRow> = {}): EgsRow {
  return {
    vn_id: vnId,
    egs_id: 42,
    gamename: 'EGS Game',
    gamename_furigana: null,
    brand_id: 1,
    brand_name: 'EGS Brand',
    model: null,
    description: 'EGS synopsis',
    image_url: 'https://example.com/egs.jpg',
    local_image: null,
    okazu: null,
    erogame: null,
    raw_json: null,
    median: 84,
    average: 82,
    dispersion: null,
    count: 12,
    sellday: '2020-01-01',
    playtime_median_minutes: 100,
    source: 'manual',
    fetched_at: 1,
    ...overrides,
  };
}

async function renderPage(id: string, searchParams: Record<string, string | string[] | undefined> = {}): Promise<string> {
  const stream = await renderToReadableStream(await VnDetail({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(searchParams),
  }));
  await stream.allReady;
  return new Response(stream).text();
}

beforeEach(() => {
  vi.mocked(deriveVnAspectDisplay).mockReset().mockReturnValue({
    aspect: 'unknown',
    aspects: [],
    width: null,
    height: null,
    source: 'unknown',
  });
  vi.mocked(deriveVnAspectKey).mockReset().mockReturnValue('unknown');
  vi.mocked(getAppSetting).mockReset().mockReturnValue(null);
  vi.mocked(getCollectionItem).mockReset().mockReturnValue(null);
  vi.mocked(getCoOccurringTags).mockReset().mockReturnValue([]);
  vi.mocked(getEgsForVn).mockReset().mockReturnValue(null);
  vi.mocked(getSourcePref).mockReset().mockReturnValue({});
  vi.mocked(getVnAspectOverride).mockReset().mockReturnValue(null);
  vi.mocked(isInCollection).mockReset().mockReturnValue(false);
  vi.mocked(isInCollectionMany).mockReset().mockReturnValue(new Set());
  vi.mocked(listActivityForVn).mockReset().mockReturnValue([]);
  vi.mocked(listGameLogForVn).mockReset().mockReturnValue([]);
  vi.mocked(listListsForVn).mockReset().mockReturnValue([]);
  vi.mocked(listSeries).mockReset().mockReturnValue([]);
  vi.mocked(materializeReleaseAspectsForVn).mockReset();
  vi.mocked(materializeReleaseMetaForVn).mockReset();
  vi.mocked(upsertVn).mockReset();
  vi.mocked(getVn).mockReset().mockResolvedValue(null);
  vi.mocked(detectSeriesForVn).mockReset().mockReturnValue(null);
  vi.mocked(isCacheFresh).mockReset().mockReturnValue(true);
});

describe('VN detail page runtime', () => {
  it('returns raw metadata for malformed ids and rejects malformed page ids', async () => {
    expect(await generateMetadata({ params: Promise.resolve({ id: 'bad%20id' }) })).toEqual({ title: 'bad id' });
    await expect(renderPage('bad%20id')).rejects.toThrow('NOT_FOUND');
    expect(getCollectionItem).not.toHaveBeenCalled();
  });

  it('renders a generic not-found page and logs upstream failures without leaking the message', async () => {
    vi.mocked(isCacheFresh).mockReturnValue(false);
    vi.mocked(getVn).mockRejectedValue(new Error('private upstream detail'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const html = await renderPage('v90001');

    expect(html).toContain(dictionaries.en.detail.notFoundTitle);
    expect(html).toContain(dictionaries.en.common.error);
    expect(html).not.toContain('private upstream detail');
    expect(html).toContain('href="https://vndb.org/v90001"');
    expect(warn).toHaveBeenCalledWith('[vn/v90001] upstream lookup failed:', 'private upstream detail');
    warn.mockRestore();
  });

  it('renders the no-result not-found page and fallback metadata', async () => {
    vi.mocked(isCacheFresh).mockReturnValue(false);

    expect(await generateMetadata({ params: Promise.resolve({ id: 'v90002' }) })).toEqual({ title: 'VN v90002' });
    const html = await renderPage('v90003');

    expect(html).toContain(dictionaries.en.detail.notFoundTitle);
    expect(html).toContain(dictionaries.en.common.error);
  });

  it('renders the not-found page without an error line when upstream throws an empty message', async () => {
    vi.mocked(isCacheFresh).mockReturnValue(false);
    vi.mocked(getVn).mockRejectedValue(new Error(''));

    const html = await renderPage('v90020');

    expect(html).toContain(dictionaries.en.detail.notFoundTitle);
    expect(html).not.toContain(`<p class="mt-3 text-xs text-status-dropped/80">${dictionaries.en.common.error}</p>`);
  });

  it('serves synthetic and fresh cached rows without reaching VNDB', async () => {
    vi.mocked(getCollectionItem).mockImplementation((id) => collectionItem(id));

    let html = await renderPage('egs%3A44');
    expect(html).toContain('recent:egs_44');
    expect(html).not.toContain('not-in-collection:egs_44');

    html = await renderPage('v90004');
    expect(html).toContain('recent:v90004');
    expect(getVn).not.toHaveBeenCalled();
  });

  it('falls back to stale cached rows when VNDB returns no row or throws', async () => {
    vi.mocked(isCacheFresh).mockReturnValue(false);
    vi.mocked(getCollectionItem).mockImplementation((id) => collectionItem(id));
    vi.mocked(getVn).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('offline'));

    expect(await renderPage('v90005')).toContain('recent:v90005');
    expect(await renderPage('v90006')).toContain('recent:v90006');
  });

  it('upserts a freshly fetched VN cache row and re-reads the materialized row', async () => {
    vi.mocked(isCacheFresh).mockReturnValue(false);
    vi.mocked(getVn).mockResolvedValue(vndbVn('v90007'));
    vi.mocked(getCollectionItem)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(collectionItem('v90007', { title: 'Fetched v90007' }));

    expect(await generateMetadata({ params: Promise.resolve({ id: 'V90007' }) })).toEqual({ title: 'Fetched v90007' });
    expect(upsertVn).toHaveBeenCalledWith(vndbVn('v90007'));
  });

  it('renders a rich non-collection VNDB page and lazy-section skeletons', async () => {
    const item = collectionItem('v90008', {
      title: 'Short',
      alttitle: 'Short alternate',
      image_url: 'https://example.com/vndb.jpg',
      image_thumb: 'https://example.com/vndb-thumb.jpg',
      released: '2021-04-03',
      olang: 'ja',
      languages: ['ja', 'en'],
      platforms: ['win', 'lin', 'mac', 'ps2', 'ps3', 'ps4', 'ps5', 'xb1', 'xbox', 'swi', 'and'],
      length_minutes: 90,
      length_votes: 2,
      rating: 80,
      votecount: 10,
      description: 'VNDB synopsis',
      developers: [{ id: 'p1', name: 'Developer' }],
      publishers: [{ id: 'p2', name: 'Publisher' }, { id: '', name: 'Anonymous publisher' }],
      tags: [{ id: 'g1', name: 'Tag', rating: 3, spoiler: 0 }],
      screenshots: [{ url: 'shot.jpg', thumbnail: 'shot-thumb.jpg' }],
      release_images: [{ release_id: 'r1', release_title: 'Edition', type: 'pkgfront', url: 'release.jpg' }],
      relations: [{
        id: 'v2',
        title: 'Related',
        alttitle: null,
        released: null,
        rating: null,
        votecount: null,
        length_minutes: null,
        languages: [],
        platforms: [],
        developers: [],
        image_url: null,
        image_thumb: null,
        image_sexual: null,
        relation: 'orig',
        relation_official: true,
      }],
      aliases: ['Alias 1', 'Alias 2', 'Alias 3', 'Alias 4', 'Alias 5', 'Alias 6', 'Alias 7'],
      titles: [
        { lang: 'ja', title: 'Short', latin: 'Short Latin', official: true, main: true },
        { lang: 'en', title: 'Short Extended Title', latin: null, official: false, main: false },
      ],
      devstatus: 1,
    });
    vi.mocked(getCollectionItem).mockReturnValue(item);
    vi.mocked(isInCollectionMany).mockReturnValue(new Set(['v2']));
    vi.mocked(deriveVnAspectDisplay).mockReturnValue({
      aspect: '16:9',
      aspects: ['16:9', '4:3'],
      width: 1280,
      height: 720,
      source: 'release',
    });

    const html = await renderPage('v90008', { spoil: '2' });
    await Promise.all(dynamicMocks.loads);

    expect(html).toContain('not-in-collection:v90008');
    expect(html).toContain('title:Short Latin:Short alternate');
    expect(html).toContain('tags:1:2');
    expect(html).toContain('field-compare:v90008:false');
    expect(html).toContain('relations:v2-true');
    expect(html).toContain('skeleton-rows:4:true');
    expect(html).toContain('skeleton-rows:3:false');
    expect(html).toContain(dictionaries.en.library.fanDisc);
    expect(html).toContain(dictionaries.en.form.andNMore.replace('{n}', '1'));
    expect(html).toContain('href="/producer/p2"');
    expect(html).toContain('href="/?aspect=16%3A9"');
    expect(materializeReleaseAspectsForVn).toHaveBeenCalledWith('v90008');
    expect(materializeReleaseMetaForVn).toHaveBeenCalledWith('v90008');
  });

  it('renders full collection-only composition and source preferences', async () => {
    const item = collectionItem('v90009', {
      title: 'Owned VN',
      alttitle: 'Owned alternate',
      image_url: 'https://example.com/vndb.jpg',
      local_image: 'vndb-local.jpg',
      image_sexual: 1,
      custom_cover: 'custom-local.jpg',
      banner_image: 'banner-local.jpg',
      banner_position: 'center',
      status: 'playing',
      user_rating: 90,
      playtime_minutes: 30,
      location: 'jp',
      edition_type: 'collector',
      edition_label: 'Collector box',
      box_type: 'large',
      physical_location: ['Cabinet'],
      series: [{ id: 3, name: 'Owned series' }],
      dumped: true,
      custom_description: 'Personal synopsis',
      description: 'VNDB synopsis',
      rating: 88,
      average: 86,
      votecount: 20,
      developers: [{ id: 'p1', name: 'Developer' }],
      va: [{
        note: null,
        character: { id: 'c1', name: 'Character', original: null },
        staff: { id: 's1', aid: 1, name: 'Actor', original: null, lang: null },
      }],
      staff: [{ eid: null, role: 'scenario', note: null, id: 's2', aid: 2, name: 'Writer', original: null, lang: null }],
    });
    const suggestion: SeriesSuggestion = {
      existing: [{ id: 3, name: 'Owned series' }],
      suggestedName: 'Owned',
      relatedInCollection: [{ id: 'v2', title: 'Related', relation: 'seq' }],
    };
    const linked = egsRow('v90009');
    vi.mocked(getCollectionItem).mockReturnValue(item);
    vi.mocked(isInCollection).mockReturnValue(true);
    vi.mocked(getSourcePref).mockReturnValue({ image: 'custom', playtime: 'egs', description: 'vndb', brand: 'egs' });
    vi.mocked(getEgsForVn).mockReturnValue(linked);
    vi.mocked(detectSeriesForVn).mockReturnValue(suggestion);
    vi.mocked(listListsForVn).mockReturnValue([{
      id: 1,
      name: 'Favorites',
      slug: 'favorites',
      description: null,
      color: null,
      icon: null,
      pinned: 1,
      created_at: 1,
      updated_at: 1,
    }]);
    vi.mocked(getCoOccurringTags).mockReturnValue([
      { id: 'g1', name: 'One', category: null, shared: 2 },
      { id: 'g2', name: 'Two', category: null, shared: 2 },
    ]);
    vi.mocked(getVnAspectOverride).mockReturnValue({ aspect_key: '4:3', note: 'CRT', updated_at: 1 });
    vi.mocked(deriveVnAspectKey).mockReturnValue('4:3');

    const html = await renderPage('v90009', { spoil: ['1', '2'] });

    expect(html).toContain('banner:v90009:/api/files/banner-local.jpg:true');
    expect(html).toContain('cover-compare:v90009:custom');
    expect(html).toContain('cover-edit:v90009');
    expect(html).toContain('cover-rotation:v90009');
    expect(html).toContain('status:playing');
    expect(html).toContain('score:86:');
    expect(html).toContain('playtime:v90009:egs');
    expect(html).toContain('custom-synopsis:v90009:Personal synopsis');
    expect(html).toContain('series-suggest:v90009');
    expect(html).toContain('session:v90009:0');
    expect(html).toContain('activity:v90009:0');
    expect(html).toContain('egs-panel:v90009:42:Owned alternate');
    expect(html).toContain('egs-details:v90009');
    expect(html).toContain('cast:1');
    expect(html).toContain('staff:1');
    expect(html).toContain('tag-overlap:2');
    expect(html).toContain('aspect-control:v90009:4:3:{&quot;aspect_key&quot;:&quot;4:3&quot;,&quot;note&quot;:&quot;CRT&quot;}');
    expect(html).toContain('editions:v90009');
    expect(html).toContain('tags:0:1');
    expect(html).toContain('lists:v90009:Favorites');
    expect(html).toContain('smart-status:v90009');
    expect(html).toContain('href="/?dumped=1"');
    expect(html).toContain('href="/?place=Cabinet"');
    expect(html).toContain('href="/series/3"');
  });

  it('uses explicit and fallback cover priorities and uploads when no owned cover exists', async () => {
    vi.mocked(isInCollection).mockReturnValue(true);
    vi.mocked(getCollectionItem).mockReturnValue(collectionItem('v90010'));
    let html = await renderPage('v90010');
    expect(html).toContain('cover-hero:v90010:none:none');
    expect(html).toContain('uploader:v90010:false');

    vi.mocked(getCollectionItem).mockReturnValue(collectionItem('v90011', {
      custom_cover: 'https://example.com/custom.jpg',
      image_url: 'https://example.com/vndb.jpg',
    }));
    vi.mocked(getSourcePref).mockReturnValue({ image: 'vndb' });
    html = await renderPage('v90011');
    expect(html).toContain('cover-compare:v90011:vndb');

    vi.mocked(getCollectionItem).mockReturnValue(collectionItem('v90012', {
      image_url: 'https://example.com/vndb.jpg',
    }));
    vi.mocked(getEgsForVn).mockReturnValue(egsRow('v90012'));
    vi.mocked(getSourcePref).mockReturnValue({ image: 'egs' });
    html = await renderPage('v90012');
    expect(html).toContain('cover-compare:v90012:egs');

    vi.mocked(getCollectionItem).mockReturnValue(collectionItem('v90016', {
      custom_cover: 'custom-auto.jpg',
    }));
    vi.mocked(getEgsForVn).mockReturnValue(null);
    vi.mocked(getSourcePref).mockReturnValue({});
    html = await renderPage('v90016');
    expect(html).toContain('cover-compare:v90016:auto');

    vi.mocked(isInCollection).mockReturnValue(false);
    vi.mocked(getCollectionItem).mockReturnValue(collectionItem('v90017'));
    vi.mocked(getEgsForVn).mockReturnValue(egsRow('v90017'));
    html = await renderPage('v90017');
    expect(html).toContain('cover-hero:v90017:https://example.com/egs.jpg:none');
  });

  it('renders synthetic owned aspect fallback and spoiler normalization variants', async () => {
    vi.mocked(isInCollection).mockReturnValue(true);
    vi.mocked(getCollectionItem).mockImplementation((id) => collectionItem(id, { notes: 'Read later' }));

    let html = await renderPage('egs_99', { spoil: '0' });
    expect(html).toContain('tags:0:0');
    expect(html).toContain('aspect-control:egs_99:unknown:null');
    expect(html).not.toContain('vndb-status:egs_99');
    expect(getVnAspectOverride).not.toHaveBeenCalledWith('egs_99');

    html = await renderPage('v90013', { spoil: 'invalid' });
    expect(html).toContain('tags:0:none');
  });

  it('covers combined-score and banner URL variants while suppressing empty optional sections', async () => {
    vi.mocked(getCollectionItem)
      .mockReturnValueOnce(collectionItem('v90014', { banner_image: 'https://example.com/banner.jpg', rating: 80 }))
      .mockReturnValueOnce(collectionItem('v90015'));
    vi.mocked(getEgsForVn)
      .mockReturnValueOnce(egsRow('v90014', { median: null }))
      .mockReturnValueOnce(egsRow('v90015', { median: 77, egs_id: null }));

    let html = await renderPage('v90014');
    expect(html).toContain('banner:v90014:https://example.com/banner.jpg:true');
    expect(html).toContain('score:80:');

    html = await renderPage('v90015');
    expect(html).toContain('score:77:');
    expect(html).toContain('egs-panel:v90015:none:VN v90015');
  });

  it('renders alternate-title, cancelled-date, aspect-source, and sparse-series variants', async () => {
    vi.mocked(isInCollection).mockReturnValue(true);
    vi.mocked(getCollectionItem).mockImplementation((id) => {
      if (id === 'v90021') {
        return collectionItem(id, {
          title: 'Base',
          titles: [{ lang: 'en', title: 'Base Extended', latin: null, official: true, main: true }],
          released: 'unknown',
          devstatus: 2,
        });
      }
      if (id === 'v90022') return collectionItem(id, { title: 'Same', alttitle: 'Same' });
      return collectionItem(id, { description: 'VNDB synopsis' });
    });
    vi.mocked(detectSeriesForVn).mockReturnValue({
      existing: [],
      suggestedName: null,
      relatedInCollection: [],
    });
    vi.mocked(getEgsForVn).mockImplementation((id) => id === 'v90023'
      ? egsRow(id, { description: null, gamename: null })
      : null);
    vi.mocked(deriveVnAspectDisplay).mockImplementation((id): VnAspectDisplay => {
      if (id === 'v90021') return { aspect: '4:3', aspects: ['4:3'], width: null, height: null, source: 'manual' };
      if (id === 'v90022') return { aspect: '16:10', aspects: ['16:10'], width: null, height: null, source: 'edition' };
      return { aspect: '21:9', aspects: ['21:9'], width: null, height: null, source: 'screenshot' };
    });

    let html = await renderPage('v90021');
    expect(html).toContain('title:Base Extended:Base');
    expect(html).toContain(dictionaries.en.detail.devstatusCancelled);
    expect(html).toContain(dictionaries.en.detail.aspectSourceManual);

    html = await renderPage('v90022');
    expect(html).toContain('title:Same:none');
    expect(html).toContain(dictionaries.en.detail.aspectSourceEdition);

    html = await renderPage('v90023');
    expect(html).toContain('field-compare:v90023:true');
    expect(html).toContain('egs-panel:v90023:42:VN v90023');
    expect(html).toContain(dictionaries.en.detail.aspectSourceScreenshot);
    expect(html).not.toContain('series-suggest:v90023');
  });
});
