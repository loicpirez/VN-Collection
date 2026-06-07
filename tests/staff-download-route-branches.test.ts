import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

type StaffDownloadRoute = typeof import('@/app/api/staff/[id]/download/route');
type DownloadResult = {
  productionCredits: readonly object[];
  vaCredits: readonly object[];
  fetched_at: number;
};

async function loadRoute(options: {
  download: (id: string) => Promise<DownloadResult>;
  recordActivity?: () => void;
}): Promise<StaffDownloadRoute> {
  vi.resetModules();
  vi.doMock('@/lib/staff-full', () => ({
    downloadFullStaffInfo: options.download,
  }));
  vi.doMock('@/lib/activity', () => ({
    recordActivity: options.recordActivity ?? (() => undefined),
  }));
  return import('@/app/api/staff/[id]/download/route');
}

function req(id: string): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/staff/${id}/download`, { method: 'POST' });
}

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/staff/[id]/download branches', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/staff-full');
    vi.doUnmock('@/lib/activity');
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('400 on malformed staff ids before downloading', async () => {
    const download = vi.fn(async (): Promise<DownloadResult> => ({
      productionCredits: [],
      vaCredits: [],
      fetched_at: 1,
    }));
    const route = await loadRoute({ download });

    const res = await route.POST(req('bad'), ctx('bad'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid staff id' });
    expect(download).not.toHaveBeenCalled();
  });

  it('keeps the successful download response when activity logging fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const route = await loadRoute({
      download: async () => ({
        productionCredits: [{ id: 'credit-a' }],
        vaCredits: [{ id: 'voice-a' }, { id: 'voice-b' }],
        fetched_at: 123,
      }),
      recordActivity: () => {
        throw new Error('activity unavailable');
      },
    });

    const res = await route.POST(req('s90001'), ctx('s90001'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      productionCount: 1,
      vaCount: 2,
      fetched_at: 123,
    });
    expect(consoleSpy).toHaveBeenCalledWith('[staff:s90001] activity log failed:', 'activity unavailable');
  });

  it('502 when the staff download fails upstream', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const route = await loadRoute({
      download: async () => {
        throw new Error('staff upstream unavailable');
      },
    });

    const res = await route.POST(req('s90002'), ctx('s90002'));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream service unavailable' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:staff/[id]/download] staff upstream unavailable');
  });
});
