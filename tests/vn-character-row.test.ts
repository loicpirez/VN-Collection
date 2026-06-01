import { describe, expect, it } from 'vitest';
import { readVnCharacterRows } from '@/lib/vn-character-row';

describe('VN character row adapter', () => {
  it('normalizes the local API payload into the client character shape', () => {
    const rows = readVnCharacterRows({
      characters: [{
        id: 'c1',
        name: 'Character',
        original: 'Original',
        aliases: ['Alias', 2],
        image: { url: 'https://example.com/c1.jpg', dims: [320, 480], sexual: 1 },
        birthday: [4, 12],
        sex: ['f', null],
        vns: [
          { id: 'v1', role: 'main', spoiler: 1, title: 'VN' },
          { id: 'v2', role: 'invalid', spoiler: null },
          { role: 'side' },
        ],
        traits: [
          { id: 'i1', name: 'Trait', group_name: 'Group', spoiler: 1, sexual: true, lie: true },
          { name: 'Missing id' },
        ],
        localImage: 'characters/c1.jpg',
      }],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'c1',
      aliases: ['Alias'],
      birthday: [4, 12],
      sex: ['f', null],
      localImage: 'characters/c1.jpg',
      vns: [
        { id: 'v1', role: 'main', spoiler: 1, title: 'VN' },
        { id: 'v2', role: 'appears', spoiler: 0 },
      ],
      traits: [{ id: 'i1', name: 'Trait', group_name: 'Group', spoiler: 1, sexual: true, lie: true }],
    });
  });

  it('drops malformed top-level rows and returns an empty list for invalid envelopes', () => {
    expect(readVnCharacterRows(null)).toEqual([]);
    expect(readVnCharacterRows({ characters: [{ id: 'c1' }, { name: 'Missing id' }] })).toEqual([]);
  });
});
