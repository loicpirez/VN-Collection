import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserActivity } from '@/lib/activity';

const { listUserActivityMock } = vi.hoisted(() => ({
  listUserActivityMock: vi.fn(),
}));

vi.mock('@/lib/activity', () => ({
  listUserActivity: listUserActivityMock,
}));

import { GET } from '@/app/api/activity/route';

function req(path: string): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`);
}

const row: UserActivity = {
  id: 1,
  occurred_at: 1700000000,
  kind: 'collection.update',
  entity: 'vn',
  entity_id: 'v90001',
  label: 'Fixture',
  payload: null,
  actor: 'user',
};

describe('GET /api/activity branches', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes bounded numeric and capped text filters to the activity reader', async () => {
    const longKind = 'k'.repeat(240);
    listUserActivityMock.mockReturnValue([row]);

    const res = await GET(req(`/api/activity?limit=999&kind=${longKind}&entity=vn&q=needle&from=nope&to=42`));
    const body = await res.json() as { activity: UserActivity[] };

    expect(res.status).toBe(200);
    expect(body.activity).toEqual([row]);
    expect(listUserActivityMock).toHaveBeenCalledWith({
      limit: 500,
      kind: 'k'.repeat(200),
      entity: 'vn',
      q: 'needle',
      from: null,
      to: 42,
    });
  });

  it('returns a sanitized internal error when the activity reader throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    listUserActivityMock.mockImplementation(() => {
      throw new Error('sqlite down');
    });

    const res = await GET(req('/api/activity'));
    const body = await res.json() as { error: string };

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[activity] DB error:', 'sqlite down');
  });
});
