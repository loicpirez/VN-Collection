import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToReadableStream } from 'react-dom/server';
import ActivityPage from '@/app/activity/page';
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

describe('activity page branches', () => {
  it('renders fallbacks for unknown kinds and wrong-typed payloads', async () => {
    vi.mocked(listRecentActivity).mockReturnValue([
      vnActivity(1, 'unknown_kind' as RecentActivityEntry['kind'], { foo: 'bar' }),
      vnActivity(2, 'status', { from: 5, to: 9 }),
      vnActivity(3, 'rating', { from: 'x', to: 'y' }),
      vnActivity(4, 'playtime', { from: 'x', to: 'y' }),
      vnActivity(5, 'started', { to: 7 }),
      vnActivity(6, 'finished', { to: 7 }),
      vnActivity(7, 'note', { length: 'x' }),
      vnActivity(8, 'manual', { text: 7 }),
      vnActivity(9, 'status', { from: 'playing', to: 'made_up_status' }),
    ]);

    const html = await renderPage({});

    expect(html).toContain('VN 1');
    expect(html.match(/<span class="text-muted">-<\/span>/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(html).toContain('>0<!-- --> ');
    expect(html).toContain('VN 5');
    expect(html).toContain('VN 8');
    expect(html).toContain('made_up_status');
  });

  it('resolves every entity href shape and the vn case', async () => {
    vi.mocked(listUserActivity).mockReturnValue([
      userActivity(1, { entity: 'vn', entity_id: 'v90100' }),
      userActivity(2, { entity: 'character', entity_id: 'c90100' }),
      userActivity(3, { entity: 'staff', entity_id: 's90100' }),
      userActivity(4, { entity: 'series', entity_id: 'g90100' }),
      userActivity(5, { entity: 'tag', entity_id: 'g90200' }),
      userActivity(6, { entity: 'unsupported', entity_id: null }),
    ]);

    const html = await renderPage({});

    expect(html).toContain('href="/vn/v90100"');
    expect(html).toContain('href="/character/c90100"');
    expect(html).toContain('href="/staff/s90100"');
    expect(html).toContain('href="/series/g90100"');
    expect(html).toContain('href="/tag/g90200"');
    expect(html).toContain('<span>unsupported</span>');
  });

  it('falls back to the raw kind label when no system-kind translation exists', async () => {
    vi.mocked(listRecentActivity).mockReturnValue([
      vnActivity(1, 'manual_unmapped' as RecentActivityEntry['kind'], { text: 'note' }),
    ]);

    const html = await renderPage({});

    expect(html).toContain('manual_unmapped');
  });

  it('hides both pagination navs when the first page holds every row', async () => {
    vi.mocked(listRecentActivity).mockReturnValue(
      Array.from({ length: 10 }, (_, index) => vnActivity(index + 1, 'manual', { text: `Log ${index + 1}` })),
    );
    vi.mocked(listUserActivity).mockReturnValue(
      Array.from({ length: 10 }, (_, index) => userActivity(index + 1)),
    );

    const html = await renderPage({});

    expect(html).toContain('Log 1');
    expect(html).toContain('Added to collection');
    expect(html).not.toContain(dictionaries.en.userActivity.pageLabel.replace('{n}', '1'));
  });

  it('threads sysPage into the VN next link and drops empty params on the system prev link', async () => {
    vi.mocked(listRecentActivity).mockReturnValue(
      Array.from({ length: 51 }, (_, index) => vnActivity(index + 1, 'manual', { text: `Log ${index + 1}` })),
    );
    vi.mocked(listUserActivity).mockReturnValue(
      Array.from({ length: 60 }, (_, index) => userActivity(index + 1)),
    );

    const html = await renderPage({ sysPage: '1' });

    expect(html).toContain('href="/activity?vnPage=1&amp;sysPage=1"');
    expect(html).toContain('href="/activity"');
  });

  it('drops empty params on the VN prev link when no filters and no sysPage are set', async () => {
    vi.mocked(listRecentActivity).mockReturnValue(
      Array.from({ length: 51 }, (_, index) => vnActivity(index + 1, 'manual', { text: `Log ${index + 1}` })),
    );

    const html = await renderPage({ vnPage: '1' });

    expect(html).toContain('href="/activity"');
    expect(html).not.toContain('href="/activity?vnPage=2"');
    expect(html).toContain('Log 51');
  });

  it('normalizes an empty array search param to an empty string filter', async () => {
    const html = await renderPage({ q: [] });

    expect(html).toContain('name="q"');
    expect(html).not.toContain(dictionaries.en.cardDensity.resetView);
    expect(listUserActivity).toHaveBeenCalledWith({ q: null, kind: null, entity: null, limit: 51 });
  });
});
