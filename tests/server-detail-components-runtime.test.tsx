import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnimeChip } from '@/components/AnimeChip';
import { AnniversaryFeed } from '@/components/AnniversaryFeed';
import { CastSection } from '@/components/CastSection';
import { ReadingSpeedBadge } from '@/components/ReadingSpeedBadge';
import { StaffSection } from '@/components/StaffSection';
import { VaTimeline } from '@/components/VaTimeline';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';

const mocks = vi.hoisted(() => ({
  anniversaries: vi.fn(),
  characterImages: vi.fn(),
  predictReadingMinutes: vi.fn(),
  profile: vi.fn(),
  timeline: vi.fn(),
  vndbAdvancedSearchRaw: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => undefined) })),
}));

vi.mock('@/lib/db', () => ({
  getCharacterImages: mocks.characterImages,
  getVaTimeline: mocks.timeline,
  todaysAnniversaries: mocks.anniversaries,
}));

vi.mock('@/lib/reading-speed', () => ({
  getReadingSpeedProfile: mocks.profile,
  predictReadingMinutes: mocks.predictReadingMinutes,
}));

vi.mock('@/lib/vndb-recommend', () => ({
  vndbAdvancedSearchRaw: mocks.vndbAdvancedSearchRaw,
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt, localSrc, src }: { alt: string; localSrc?: string | null; src?: string | null }) => (
    <img alt={alt} src={localSrc ?? src ?? undefined} />
  ),
}));

vi.mock('@/components/vn-detail/DetailSectionFrame', () => ({
  SectionCountReport: ({ count }: { count: number | null }) => <span data-count={count ?? ''} />,
}));

vi.mock('@/components/ScrollFadeRight', () => ({
  ScrollFadeRight: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));

vi.mock('@/components/AnniversaryFeedView', () => ({
  AnniversaryFeedView: ({ entries, title }: { entries: Array<{ id: string; title: string }>; title: string }) => (
    <div data-count={entries.length} data-title={title}>
      {entries.map((entry) => <span key={entry.id}>{entry.title}</span>)}
    </div>
  ),
}));

const t = dictionaries[DEFAULT_LOCALE];

beforeEach(() => {
  mocks.anniversaries.mockReset().mockReturnValue([]);
  mocks.characterImages.mockReset().mockReturnValue(new Map());
  mocks.predictReadingMinutes.mockReset().mockReturnValue(null);
  mocks.profile.mockReset().mockReturnValue({
    sampleSize: 0,
    multiplierVsVndb: null,
    multiplierVsEgs: null,
    medianMyMinutes: null,
  });
  mocks.timeline.mockReset().mockReturnValue([]);
  mocks.vndbAdvancedSearchRaw.mockReset().mockResolvedValue([]);
});

describe('server detail helpers', () => {
  it('renders staff groups, falls unknown roles back to staff, and skips malformed entries', async () => {
    expect(await StaffSection({ staff: [] })).toBeNull();
    expect(await StaffSection({ staff: [{ id: 's90001' }] })).toBeNull();
    const html = renderToStaticMarkup(await StaffSection({
      staff: [
        { id: 's90001', name: 'Writer', original: 'Original Writer', role: 'scenario', eid: 2, note: 'Lead' },
        { id: 's90002', name: 'Helper', original: 'Helper', role: 'unexpected' },
        { id: 's90004', name: 'Unassigned' },
        { id: 's90003', role: 'music' },
      ],
    }));
    expect(html).toContain('href="/staff?role=scenario"');
    expect(html).toContain('href="/staff/s90001"');
    expect(html).toContain('Original Writer');
    expect(html).toContain('href="/staff?role=staff"');
  });

  it('renders valid cast links with local artwork and skips incomplete credits', async () => {
    expect(await CastSection({ va: [] })).toBeNull();
    mocks.characterImages.mockReturnValue(new Map([['c90001', { local_path: '/local/c90001.jpg' }]]));
    const html = renderToStaticMarkup(await CastSection({
      va: [
        {
          note: 'credited role',
          character: { id: 'c90001', name: 'Heroine', original: 'Original Heroine', image: { url: 'https://example.test/c.jpg' } },
          staff: { id: 's90001', name: 'Actor', original: 'Original Actor' },
        },
        {
          character: { id: 'c90003', name: 'Supporting' },
          staff: { id: 's90002', name: 'Actor Two' },
        },
        { character: { id: 'c90002', name: 'Incomplete' }, staff: null },
      ],
    }));
    expect(mocks.characterImages).toHaveBeenCalledWith(['c90001', 'c90003', 'c90002']);
    expect(html).toContain('href="/character/c90001"');
    expect(html).toContain('href="/staff/s90001"');
    expect(html).toContain('/local/c90001.jpg');
    expect(html).toContain('Original Heroine');
    expect(html).toContain('Original Actor');
  });

  it('renders an anime chip only for matched VNDB results', async () => {
    expect(await AnimeChip({ vnId: 'egs_90001' })).toBeNull();
    expect(mocks.vndbAdvancedSearchRaw).not.toHaveBeenCalled();
    expect(await AnimeChip({ vnId: 'v90001' })).toBeNull();
    mocks.vndbAdvancedSearchRaw.mockResolvedValueOnce([{ id: 'v90001' }]);
    const html = renderToStaticMarkup(await AnimeChip({ vnId: 'v90001' }));
    expect(html).toContain(t.animeChip.label);
    mocks.vndbAdvancedSearchRaw.mockRejectedValueOnce(new Error('offline'));
    expect(await AnimeChip({ vnId: 'v90001' })).toBeNull();
  });

  it('renders reading-speed empty, insufficient-sample, VNDB, and EGS prediction states', async () => {
    expect(await ReadingSpeedBadge({ vndbLength: null, egsLength: null })).toBeNull();
    let html = renderToStaticMarkup(await ReadingSpeedBadge({ vndbLength: 600, egsLength: null }));
    expect(html).toContain(t.readingSpeed.notEnough);

    mocks.profile.mockReturnValue({
      sampleSize: 4,
      multiplierVsVndb: 0.75,
      multiplierVsEgs: 1.25,
      medianMyMinutes: 500,
    });
    mocks.predictReadingMinutes.mockReturnValueOnce(450);
    html = renderToStaticMarkup(await ReadingSpeedBadge({ vndbLength: 600, egsLength: 400 }));
    expect(html).toContain('x0,75');

    mocks.predictReadingMinutes.mockReturnValueOnce(500);
    html = renderToStaticMarkup(await ReadingSpeedBadge({ vndbLength: null, egsLength: 400 }));
    expect(html).toContain('x1,25');
  });

  it('renders anniversaries through the client view with an eight-entry cap', async () => {
    mocks.anniversaries.mockReturnValue(Array.from({ length: 10 }, (_unused, index) => ({
      id: `v9${String(index).padStart(4, '0')}`,
      title: `Anniversary ${index}`,
      years: index + 1,
      image_url: null,
      image_thumb: null,
      local_image_thumb: null,
      image_sexual: null,
    })));
    const html = renderToStaticMarkup(await AnniversaryFeed({}));
    expect(html).toContain('data-count="8"');
    expect(html).toContain('Anniversary 7');
    expect(html).not.toContain('Anniversary 8');
  });

  it('renders VA timeline gaps, owned percentages, and the unknown-year bucket', async () => {
    expect(await VaTimeline({ sid: 's90001' })).toBeNull();
    mocks.timeline.mockReturnValue([
      { year: 0, total: 2, inCollection: 1, vnIds: ['v90001', 'v90002'] },
      { year: 2020, total: 1, inCollection: 1, vnIds: ['v90003'] },
      { year: 2022, total: 2, inCollection: 1, vnIds: ['v90004', 'v90005'] },
    ]);
    const html = renderToStaticMarkup(await VaTimeline({ sid: 's90001' }));
    expect(html).toContain(t.staff.timeline.title);
    expect(html).toContain('2020 / 1');
    expect(html).toContain('2021 / 0');
    expect(html).toContain('2022 / 2');
    expect(html).toContain(`2 ${t.staff.timeline.unknownYear}`);
  });

  it('renders an unknown-only VA timeline and rejects malformed negative-year rows', async () => {
    mocks.timeline.mockReturnValue([{ year: 0, total: 2, inCollection: 1, vnIds: ['v90001', 'v90002'] }]);
    let html = renderToStaticMarkup(await VaTimeline({ sid: 's90001' }));
    expect(html).toContain(`2 ${t.staff.timeline.unknownYear}`);
    expect(html).not.toContain('2020');

    mocks.timeline.mockReturnValue([{ year: -1, total: 1, inCollection: 0, vnIds: ['v90001'] }]);
    expect(await VaTimeline({ sid: 's90001' })).toBeNull();
  });
});
