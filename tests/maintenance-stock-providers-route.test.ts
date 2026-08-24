import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ listFreshness: vi.fn() }));

vi.mock('@/lib/db/repositories/stock-provider-maintenance', () => ({
  getStockProviderMaintenanceRepository: () => ({ listFreshness: mocks.listFreshness }),
}));

import { GET } from '@/app/api/maintenance/stock-providers/route';

describe('stock provider maintenance route', () => {
  beforeEach(() => mocks.listFreshness.mockReset());

  it('rejects external requests before database access', async () => {
    const response = await GET(new NextRequest('http://93.184.216.34/api/maintenance/stock-providers'));
    expect(response.status).toBe(403);
    expect(mocks.listFreshness).not.toHaveBeenCalled();
  });

  it('returns local provider diagnostics', async () => {
    const providers = [{
      provider: 'sofmap',
      latest_status_at: 300,
      status_rows: 4,
      last_batch_started_at: 200,
      updated_after_last_batch: true,
    }];
    mocks.listFreshness.mockResolvedValue(providers);
    const response = await GET(new NextRequest('http://127.0.0.1/api/maintenance/stock-providers'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ providers });
  });
});
