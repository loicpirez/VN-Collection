import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  postgresQuery: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: mocks.postgresQuery,
  withPostgresTransaction: mocks.transaction,
}));

import { createPostgresPeopleRepository } from '@/lib/db/repositories/people';

function vnCredit(overrides: Record<string, string | number | boolean | null> = {}) {
  return {
    id: 'v90001',
    title: 'Credit title',
    alttitle: null,
    image_url: null,
    image_thumb: null,
    image_sexual: null,
    local_image: null,
    local_image_thumb: null,
    released: null,
    rating: null,
    role: 'scenario',
    eid: null,
    note: null,
    credited_as: 'Staff Name',
    c_id: 'c90001',
    c_name: 'Character',
    c_original: null,
    c_image_url: null,
    c_local_image: null,
    in_collection: true,
    ...overrides,
  };
}

function characterProfile(id: string, name: string, aliases: string[] = []) {
  return {
    id,
    name,
    original: null,
    aliases,
    description: null,
    image: null,
    blood_type: null,
    height: null,
    weight: null,
    bust: null,
    waist: null,
    hips: null,
    cup: null,
    age: null,
    birthday: null,
    sex: null,
    gender: null,
    vns: [],
    traits: [],
  };
}

describe('PostgreSQL people repository branch behavior', () => {
  beforeEach(() => {
    mocks.clientQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
    mocks.postgresQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.transaction.mockReset().mockImplementation(async (work) => work({ query: mocks.clientQuery }));
  });

  it('resolves staff profiles from production, voice, or no credits', async () => {
    const repository = createPostgresPeopleRepository();
    mocks.postgresQuery.mockResolvedValueOnce({
      rows: [{ name: 'Production Name', original: null, lang: 'ja' }],
    });
    await expect(repository.staffProfile('s1')).resolves.toEqual({
      sid: 's1',
      name: 'Production Name',
      original: null,
      lang: 'ja',
    });

    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ name: 'Voice Name', original: 'Original', lang: 'ja' }] });
    await expect(repository.staffProfile('s2')).resolves.toMatchObject({ sid: 's2', name: 'Voice Name' });

    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(repository.staffProfile('s3')).resolves.toBeNull();
  });

  it('groups repeated production and voice rows under one VN with public option defaults', async () => {
    const repository = createPostgresPeopleRepository();
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [
        vnCredit(),
        vnCredit({ role: 'music', eid: 2 }),
      ] })
      .mockResolvedValueOnce({ rows: [
        vnCredit(),
        vnCredit({ c_id: 'c90002', c_name: 'Second character' }),
      ] });

    await expect(repository.productionCredits('s1')).resolves.toEqual([
      expect.objectContaining({ roles: [
        expect.objectContaining({ role: 'scenario' }),
        expect.objectContaining({ role: 'music' }),
      ] }),
    ]);
    await expect(repository.voiceCredits('s1', { inCollectionOnly: true })).resolves.toEqual([
      expect.objectContaining({ characters: [
        expect.objectContaining({ id: 'c90001' }),
        expect.objectContaining({ id: 'c90002' }),
      ] }),
    ]);
    expect(mocks.postgresQuery.mock.calls[0]?.[1]).toEqual(['s1', false]);
    expect(mocks.postgresQuery.mock.calls[1]?.[1]).toEqual(['s1', true]);
  });

  it('merges timeline buckets, sibling duplicates, and repeated voice actors', async () => {
    const repository = createPostgresPeopleRepository();
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [
      { year: 2024, vn_id: 'v1', in_collection: true },
      { year: 2024, vn_id: 'v2', in_collection: false },
      { year: 0, vn_id: 'v3', in_collection: false },
    ] });
    await expect(repository.voiceTimeline('s1')).resolves.toEqual([
      { year: 0, total: 1, inCollection: 0, vnIds: ['v3'] },
      { year: 2024, total: 2, inCollection: 1, vnIds: ['v1', 'v2'] },
    ]);

    mocks.postgresQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repository.characterSiblings('c0')).resolves.toEqual([]);
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [{ value: 'Shared' }] })
      .mockResolvedValueOnce({ rows: [
        { c_id: 'c2', c_name: 'Shared', c_original: null, c_image_url: null, vn_id: 'v1', vn_title: 'One' },
        { c_id: 'c2', c_name: 'Shared', c_original: null, c_image_url: null, vn_id: 'v1', vn_title: 'One' },
        { c_id: 'c2', c_name: 'Shared', c_original: null, c_image_url: null, vn_id: 'v2', vn_title: 'Two' },
      ] });
    await expect(repository.characterSiblings('c1')).resolves.toEqual([
      expect.objectContaining({ c_id: 'c2', vns: [
        { vn_id: 'v1', vn_title: 'One' },
        { vn_id: 'v2', vn_title: 'Two' },
      ] }),
    ]);

    mocks.postgresQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repository.staffSiblings('s0')).resolves.toEqual([]);
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [{ value: 'Shared staff' }] })
      .mockResolvedValueOnce({ rows: [
        { sid: 's2', name: 'Shared staff', original: null, vn_id: 'v1', vn_title: 'One' },
        { sid: 's2', name: 'Shared staff', original: null, vn_id: 'v1', vn_title: 'One' },
        { sid: 's2', name: 'Shared staff', original: null, vn_id: 'v2', vn_title: 'Two' },
      ] });
    await expect(repository.staffSiblings('s1')).resolves.toEqual([
      expect.objectContaining({ sid: 's2', vns: [
        { vn_id: 'v1', vn_title: 'One' },
        { vn_id: 'v2', vn_title: 'Two' },
      ] }),
    ]);

    mocks.postgresQuery.mockResolvedValueOnce({ rows: [
      { sid: 's3', va_name: 'Voice', va_original: null, va_lang: 'ja', id: 'v1', title: 'One', released: null, in_collection: true },
      { sid: 's3', va_name: 'Voice', va_original: null, va_lang: 'ja', id: 'v2', title: 'Two', released: null, in_collection: false },
    ] });
    await expect(repository.voiceActorsForCharacter('c1')).resolves.toEqual([
      expect.objectContaining({ sid: 's3', vns: [
        expect.objectContaining({ id: 'v1' }),
        expect.objectContaining({ id: 'v2' }),
      ] }),
    ]);
  });

  it('filters decoded character profiles and attaches deduplicated language rows', async () => {
    const repository = createPostgresPeopleRepository();
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [
        { body: '{broken' },
        { body: '[]' },
        { body: '{"profile":null}' },
        { body: JSON.stringify({ profile: characterProfile('c90001', 'First') }) },
      ] })
      .mockResolvedValueOnce({ rows: [
        { c_id: 'c90001', va_lang: 'ja' },
        { c_id: 'c90001', va_lang: 'en' },
      ] });

    await expect(repository.searchCharacters()).resolves.toEqual([
      expect.objectContaining({
        profile: expect.objectContaining({ id: 'c90001', name: 'First' }),
        voice_languages: ['ja', 'en'],
      }),
    ]);

    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [
        { body: JSON.stringify({ profile: characterProfile('c90002', 'Other') }) },
        { body: JSON.stringify({ profile: characterProfile('c90003', 'Needle result', ['Needle alias']) }) },
        { body: JSON.stringify({ profile: characterProfile('c90004', 'Needle later') }) },
      ] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(repository.searchCharacters({ q: ' needle ', limit: 1 })).resolves.toEqual([
      expect.objectContaining({
        profile: expect.objectContaining({ id: 'c90003' }),
        voice_languages: [],
      }),
    ]);

    mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ body: '{"profile":{"id":"bad"}}' }] });
    await expect(repository.searchCharacters({ q: 'absent' })).resolves.toEqual([]);
  });

  it('builds optional staff filters and maps role aggregates', async () => {
    const repository = createPostgresPeopleRepository();
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [{
      sid: 's1',
      name: 'Staff',
      original: null,
      lang: 'ja',
      roles: 'scenario,music,',
      vn_count: 3,
    }] });
    await expect(repository.searchStaff()).resolves.toEqual([{
      id: 's1',
      name: 'Staff',
      original: null,
      lang: 'ja',
      roles: ['scenario', 'music'],
      vn_count: 3,
    }]);

    mocks.postgresQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repository.searchStaff({
      q: ' Staff% ',
      role: 'scenario',
      lang: 'ja',
      limit: 999,
    })).resolves.toEqual([]);
    const [sql, values] = mocks.postgresQuery.mock.calls[1] as [string, readonly unknown[]];
    expect(sql).toContain('WHERE');
    expect(values).toEqual(['%staff\\%%', 'scenario', 'ja', 500]);
  });
});
