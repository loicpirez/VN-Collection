import { describe, expect, it } from 'vitest';
import { decodeVndbProducer, decodeVndbStaff, decodeVndbTag, decodeVndbTrait } from '@/lib/vndb-profile-row-shape';

const EXTLINK = { url: 'https://example.invalid/profile', label: 'Site', name: 'site', id: 71 };

describe('VNDB compact profile row decoders', () => {
  it('decodes producer and staff profiles with normalized ids', () => {
    expect(decodeVndbProducer({
      id: 'P90081',
      name: 'Studio',
      original: null,
      aliases: ['Alias'],
      lang: 'ja',
      type: 'co',
      description: null,
      extlinks: [EXTLINK],
    })).toMatchObject({
      id: 'p90081',
      extlinks: [{ id: 71 }],
    });
    expect(decodeVndbStaff({
      id: 'S90081',
      aid: 1,
      ismain: true,
      name: 'Staff',
      original: null,
      lang: 'ja',
      gender: null,
      description: null,
      aliases: [{ aid: 1, name: 'Staff', latin: null, ismain: true }],
      extlinks: [EXTLINK],
    })).toMatchObject({
      id: 's90081',
      aliases: [{ aid: 1 }],
    });
  });

  it('decodes tag and trait profiles with normalized ids', () => {
    expect(decodeVndbTag({
      id: 'G90081',
      name: 'Tag',
      aliases: [],
      description: null,
      category: 'cont',
      searchable: true,
      applicable: true,
      vn_count: 1,
    })).toMatchObject({
      id: 'g90081',
      category: 'cont',
    });
    expect(decodeVndbTrait({
      id: 'I90081',
      name: 'Trait',
      aliases: [],
      description: null,
      searchable: true,
      applicable: true,
      sexual: false,
      group_id: 'I90082',
      group_name: 'Group',
      char_count: 1,
    })).toMatchObject({
      id: 'i90081',
      group_id: 'i90082',
    });
  });

  it('rejects malformed nested and bounded fields', () => {
    expect(decodeVndbProducer({
      id: 'p90081',
      name: 'Studio',
      original: null,
      aliases: [],
      lang: null,
      type: null,
      description: null,
      extlinks: [{ ...EXTLINK, id: {} }],
    })).toBeNull();
    expect(decodeVndbStaff({
      id: 's90081',
      aid: 1,
      ismain: true,
      name: 'Staff',
      original: null,
      lang: null,
      gender: null,
      description: null,
      aliases: [{ aid: -1, name: 'Staff', latin: null, ismain: true }],
      extlinks: [],
    })).toBeNull();
    expect(decodeVndbTag({
      id: 'g90081',
      name: 'Tag',
      aliases: [],
      description: null,
      category: 'bad',
      searchable: true,
      applicable: true,
      vn_count: 1,
    })).toBeNull();
    expect(decodeVndbTrait({
      id: 'i90081',
      name: 'Trait',
      aliases: [],
      description: null,
      searchable: true,
      applicable: true,
      sexual: false,
      group_id: 'bad',
      group_name: null,
      char_count: 1,
    })).toBeNull();
  });
});
