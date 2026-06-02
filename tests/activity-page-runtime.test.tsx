import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToReadableStream } from 'react-dom/server';
import ActivityPage, { generateMetadata } from '@/app/activity/page';
import { listActivityKinds, listUserActivity, type UserActivity } from '@/lib/activity';
import { listRecentActivity, type RecentActivityEntry } from '@/lib/db';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('@/lib/activity', () => ({
  listActivityKinds: vi.fn(),
  listUserActivity: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  listRecentActivity: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

function vnActivity(
  id: number,
  kind: RecentActivityEntry['kind'],
  payload: Record<string, unknown> | null,
): RecentActivityEntry {
  return {
    id,
    vn_id: `v${90000 + id}`,
    kind,
    payload,
    occurred_at: Date.UTC(2026, 0, id),
    title: `VN ${id}`,
  };
}

function userActivity(id: number, overrides: Partial<UserActivity> = {}): UserActivity {
  return {
    id,
    occurred_at: Date.UTC(2026, 1, id),
    kind: 'collection.add',
    entity: 'vn',
    entity_id: `v${91000 + id}`,
    label: `System ${id}`,
    payload: null,
    actor: 'user',
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(listActivityKinds).mockReset().mockReturnValue([]);
  vi.mocked(listUserActivity).mockReset().mockReturnValue([]);
  vi.mocked(listRecentActivity).mockReset().mockReturnValue([]);
});

async function renderPage(searchParams: Record<string, string | string[] | undefined>): Promise<string> {
  const stream = await renderToReadableStream(await ActivityPage({ searchParams: Promise.resolve(searchParams) }));
  await stream.allReady;
  return new Response(stream).text();
}

describe('activity page runtime', () => {
  it('renders metadata, empty sections, and normalized filter values', async () => {
    expect(await generateMetadata()).toEqual({ title: dictionaries.en.userActivity.title });

    const html = await renderPage({
      q: ['  needle  ', 'ignored'],
      kind: '',
      entity: 'rejected',
      vnPage: '-2',
      sysPage: 'invalid',
    });

    expect(html).toContain('value="needle"');
    expect(html).toContain('href="/activity"');
    expect(html).not.toContain('value="rejected"');
    expect(html.match(new RegExp(dictionaries.en.userActivity.empty, 'g'))).toHaveLength(2);
    expect(listUserActivity).toHaveBeenCalledWith({
      q: 'needle',
      kind: null,
      entity: null,
      limit: 51,
    });
    expect(listRecentActivity).toHaveBeenCalledWith(51);
  });

  it('renders every VN summary, system entity link shape, and first-page next links', async () => {
    vi.mocked(listActivityKinds).mockReturnValue(['collection.add', 'custom.raw_kind']);
    vi.mocked(listRecentActivity).mockReturnValue([
      vnActivity(1, 'status', { from: 'playing', to: 'completed' }),
      vnActivity(2, 'status', { from: 'custom', to: null }),
      vnActivity(3, 'rating', { from: 7, to: 8 }),
      vnActivity(4, 'rating', { from: null, to: null }),
      vnActivity(5, 'playtime', { from: 30, to: 120, delta: 90 }),
      vnActivity(6, 'playtime', { from: 120, to: 60, delta: -60 }),
      vnActivity(7, 'playtime', { from: 0, to: 0 }),
      vnActivity(8, 'favorite', { to: true }),
      vnActivity(9, 'favorite', { to: false }),
      vnActivity(10, 'started', { to: '2026-01-01' }),
      vnActivity(11, 'started', { to: null }),
      vnActivity(12, 'finished', { to: '2026-01-02' }),
      vnActivity(13, 'finished', { to: null }),
      vnActivity(14, 'note', { length: 42 }),
      vnActivity(15, 'note', null),
      vnActivity(16, 'manual', { text: 'Manual log' }),
      vnActivity(17, 'manual', null),
      ...Array.from({ length: 34 }, (_, index) => vnActivity(18 + index, 'favorite', { to: true })),
    ]);
    vi.mocked(listUserActivity).mockReturnValue([
      userActivity(1),
      userActivity(2, { kind: 'custom.raw_kind', entity: 'producer', entity_id: 'p1' }),
      userActivity(3, { entity: 'unsupported', entity_id: 'x1' }),
      userActivity(4, { entity: 'staff', entity_id: null }),
      userActivity(5, { entity: null, entity_id: 'v1' }),
      userActivity(6, { entity: null, entity_id: null }),
      ...Array.from({ length: 45 }, (_, index) => userActivity(7 + index)),
    ]);

    const html = await renderPage({});

    expect(html).toContain(dictionaries.en.status.playing);
    expect(html).toContain(dictionaries.en.status.completed);
    expect(html).toContain('Manual log');
    expect(html).toContain(dictionaries.en.userActivity.favOn);
    expect(html).toContain(dictionaries.en.userActivity.favOff);
    expect(html).toContain('href="/producer/p1"');
    expect(html).toContain('<span>unsupported<!-- --> / x1</span>');
    expect(html).toContain('Custom raw kind');
    expect(html).toContain('href="/activity?vnPage=1"');
    expect(html).toContain('href="/activity?sysPage=1"');
  });

  it('preserves filters across later pages and hides VN changes for a selected system kind', async () => {
    vi.mocked(listUserActivity).mockReturnValue(
      Array.from({ length: 102 }, (_, index) => userActivity(index + 1, { entity: 'trait', entity_id: 'i1' })),
    );
    vi.mocked(listRecentActivity).mockReturnValue(
      Array.from({ length: 102 }, (_, index) => vnActivity(index + 1, 'manual', { text: `Log ${index + 1}` })),
    );

    const html = await renderPage({
      q: 'needle',
      kind: 'collection.add',
      entity: 'trait',
      vnPage: '1',
      sysPage: '1',
    });

    expect(html).not.toContain(dictionaries.en.userActivity.vnChanges);
    expect(html).toContain('href="/activity?q=needle&amp;kind=collection.add&amp;entity=trait&amp;vnPage=1"');
    expect(html).toContain('href="/activity?q=needle&amp;kind=collection.add&amp;entity=trait&amp;vnPage=1&amp;sysPage=2"');
    expect(html).toContain('href="/trait/i1"');
    expect(listRecentActivity).toHaveBeenCalledWith(101);
    expect(listUserActivity).toHaveBeenCalledWith({
      q: 'needle',
      kind: 'collection.add',
      entity: 'trait',
      limit: 101,
    });
  });

  it('falls back to empty sections when reading activity fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(listActivityKinds).mockImplementation(() => {
      throw new Error('database unavailable');
    });

    const html = await renderPage({});

    expect(html.match(new RegExp(dictionaries.en.userActivity.empty, 'g'))).toHaveLength(2);
    expect(errorSpy).toHaveBeenCalledWith('[activity page] DB error:', 'database unavailable');
    errorSpy.mockRestore();
  });
});
