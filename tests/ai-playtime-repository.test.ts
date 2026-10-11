import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiPlaytimeEstimateInput } from '@/lib/db/repositories/ai-playtime';

const mocks = vi.hoisted(() => ({
  config: vi.fn(() => ({ backend: 'postgres' })),
  query: vi.fn(),
  prepare: vi.fn(),
  get: vi.fn(),
  run: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('@/lib/db/postgres-config', () => ({ readDatabaseConfig: mocks.config }));
vi.mock('@/lib/db/postgres', () => ({ postgresQuery: mocks.query }));
vi.mock('@/lib/db', () => ({ db: { prepare: mocks.prepare }, invalidateAggregateStats: mocks.invalidate }));

import { getAiPlaytimeRepository } from '@/lib/db/repositories/ai-playtime';

const estimate: AiPlaytimeEstimateInput = {
  minutes: 900, lower_minutes: 720, upper_minutes: 1080,
  confidence: 0.75, model: 'synthetic-estimator', rationale: 'Synthetic evidence.', generated_at: 1000,
};
const row = {
  ai_playtime_minutes: estimate.minutes,
  ai_playtime_lower_minutes: estimate.lower_minutes,
  ai_playtime_upper_minutes: estimate.upper_minutes,
  ai_playtime_confidence: estimate.confidence,
  ai_playtime_model: estimate.model,
  ai_playtime_rationale: estimate.rationale,
  ai_playtime_generated_at: estimate.generated_at,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(2000);
  mocks.config.mockReturnValue({ backend: 'postgres' });
  mocks.query.mockResolvedValue({ rows: [row] });
  mocks.prepare.mockReturnValue({ get: mocks.get, run: mocks.run });
  mocks.get.mockReturnValue(row);
});
afterEach(() => vi.useRealTimers());

describe.each(['postgres', 'sqlite'])('AI playtime repository on %s', (backend) => {
  it('reads all provenance and reuses the configured adapter', async () => {
    mocks.config.mockReturnValue({ backend });
    const repository = getAiPlaytimeRepository();
    expect(getAiPlaytimeRepository()).toBe(repository);
    await expect(repository.get('v90001')).resolves.toEqual(estimate);
    if (backend === 'postgres') expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('WHERE vn_id = $1'), ['v90001']);
    else expect(mocks.get).toHaveBeenCalledWith('v90001');
  });

  it('keeps optional confidence and rationale nullable', async () => {
    mocks.config.mockReturnValue({ backend });
    const optional = { ...row, ai_playtime_confidence: null, ai_playtime_rationale: null };
    mocks.query.mockResolvedValue({ rows: [optional] });
    mocks.get.mockReturnValue(optional);
    await expect(getAiPlaytimeRepository().get('v90001')).resolves.toEqual({ ...estimate, confidence: null, rationale: null });
  });

  it.each([
    'absent', 'ai_playtime_minutes', 'ai_playtime_lower_minutes', 'ai_playtime_upper_minutes',
    'ai_playtime_model', 'ai_playtime_generated_at',
  ])('excludes an incomplete estimate missing %s', async (field) => {
    mocks.config.mockReturnValue({ backend });
    const incomplete = field === 'absent' ? undefined : { ...row, [field]: null };
    mocks.query.mockResolvedValue({ rows: incomplete ? [incomplete] : [] });
    mocks.get.mockReturnValue(incomplete);
    await expect(getAiPlaytimeRepository().get('v90001')).resolves.toBeNull();
  });

  it('persists exactly the seven AI fields and update timestamp', async () => {
    mocks.config.mockReturnValue({ backend });
    await getAiPlaytimeRepository().set('v90001', estimate);
    const params = [900, 720, 1080, 0.75, 'synthetic-estimator', 'Synthetic evidence.', 1000, 2000, 'v90001'];
    if (backend === 'postgres') expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('ai_playtime_generated_at = $7'), params);
    else expect(mocks.run).toHaveBeenCalledWith(...params);
    const sql = backend === 'postgres' ? mocks.query.mock.calls[0]?.[0] : mocks.prepare.mock.calls[0]?.[0];
    expect(sql).not.toMatch(/\bplaytime_minutes\s*=/);
  });

  it('clears every provenance field without touching personally logged time', async () => {
    mocks.config.mockReturnValue({ backend });
    await getAiPlaytimeRepository().clear('v90001');
    if (backend === 'postgres') expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('ai_playtime_generated_at = NULL'), [2000, 'v90001']);
    else expect(mocks.run).toHaveBeenCalledWith(2000, 'v90001');
    const sql = backend === 'postgres' ? mocks.query.mock.calls[0]?.[0] : mocks.prepare.mock.calls[0]?.[0];
    expect(sql).not.toMatch(/\bplaytime_minutes\s*=/);
  });
});
