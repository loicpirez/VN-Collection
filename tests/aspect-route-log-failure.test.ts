import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deriveVnAspectKey: vi.fn(),
  getVnAspectOverride: vi.fn(),
  recordActivity: vi.fn(),
  setVnAspectOverride: vi.fn(),
}));

vi.mock('@/lib/activity', () => ({
  recordActivity: mocks.recordActivity,
}));

vi.mock('@/lib/db', () => ({
  deriveVnAspectKey: mocks.deriveVnAspectKey,
  getVnAspectOverride: mocks.getVnAspectOverride,
  setVnAspectOverride: mocks.setVnAspectOverride,
}));

import { PATCH } from '@/app/api/vn/[id]/aspect/route';

function req(body: unknown): NextRequest {
  return new NextRequest('http://127.0.0.1/api/vn/v90123/aspect', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('aspect route activity failure branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deriveVnAspectKey.mockReturnValue('16:9');
    mocks.getVnAspectOverride.mockReturnValue({ vn_id: 'v90123', aspect_key: '16:9', note: null });
  });

  it('keeps the PATCH response successful when activity logging fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.recordActivity.mockImplementation(() => {
      throw new Error('activity failed');
    });

    const res = await PATCH(req({ aspect_key: '16:9' }), { params: Promise.resolve({ id: 'v90123' }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      override: { vn_id: 'v90123', aspect_key: '16:9', note: null },
      derived: '16:9',
    });
    expect(consoleSpy).toHaveBeenCalledWith('[aspect:v90123] activity log failed:', 'activity failed');
    consoleSpy.mockRestore();
  });
});
