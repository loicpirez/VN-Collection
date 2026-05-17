/**
 * Pin the rich-header contract for `/staff/[id]`.
 *
 * `getStaffWithExtras` is the pure helper that wraps the staff_full
 * cache payload + local credit counts into a single display struct.
 * The unit test asserts:
 *
 *  - the canonical `ismain` alias is dropped,
 *  - aliases are de-duped by `aid`,
 *  - extlinks are de-duped by URL,
 *  - credit counts flow through verbatim,
 *  - the i18n credit-summary template fills `{prod}` and `{va}`.
 */
import { describe, expect, it } from 'vitest';
import {
  formatCreditCountSummary,
  getStaffWithExtras,
  type StaffExtrasInput,
} from '@/lib/staff-extras';

function stubProfile(
  overrides: Partial<StaffExtrasInput['profile']> = {},
): StaffExtrasInput['profile'] {
  return {
    id: 's11',
    name: 'placeholder name',
    original: 'プレースホルダ',
    lang: 'ja',
    gender: 'f',
    description: 'Stub description for tests.',
    aliases: [],
    extlinks: [],
    ...overrides,
  } as StaffExtrasInput['profile'];
}

describe('getStaffWithExtras', () => {
  it('returns name/original/lang/gender from the cached profile', () => {
    const out = getStaffWithExtras({
      profile: stubProfile(),
      productionCount: 3,
      voiceCount: 7,
    });
    expect(out.name).toBe('placeholder name');
    expect(out.original).toBe('プレースホルダ');
    expect(out.lang).toBe('ja');
    expect(out.gender).toBe('f');
    expect(out.description).toBe('Stub description for tests.');
    expect(out.productionCount).toBe(3);
    expect(out.voiceCount).toBe(7);
  });

  it('drops the canonical (`ismain: true`) alias row', () => {
    const out = getStaffWithExtras({
      profile: stubProfile({
        aliases: [
          { aid: 1, name: 'placeholder name', latin: 'placeholder name', ismain: true },
          { aid: 2, name: 'stage name', latin: 'stage name', ismain: false },
        ],
      }),
      productionCount: 0,
      voiceCount: 0,
    });
    expect(out.aliases.map((a) => a.aid)).toEqual([2]);
  });

  it('de-dupes aliases by aid even when VNDB lists them twice', () => {
    const out = getStaffWithExtras({
      profile: stubProfile({
        aliases: [
          { aid: 2, name: 'stage name', latin: null, ismain: false },
          { aid: 2, name: 'stage name', latin: null, ismain: false },
          { aid: 3, name: 'pen name', latin: null, ismain: false },
        ],
      }),
      productionCount: 0,
      voiceCount: 0,
    });
    expect(out.aliases.map((a) => a.aid).sort()).toEqual([2, 3]);
  });

  it('de-dupes extlinks by URL', () => {
    const out = getStaffWithExtras({
      profile: stubProfile({
        extlinks: [
          { url: 'https://example.test/a', label: 'A', name: 'a' },
          { url: 'https://example.test/a', label: 'A2', name: 'a2' },
          { url: 'https://example.test/b', label: 'B', name: 'b' },
        ],
      }),
      productionCount: 0,
      voiceCount: 0,
    });
    expect(out.extlinks.map((l) => l.url).sort()).toEqual([
      'https://example.test/a',
      'https://example.test/b',
    ]);
  });

  it('degrades cleanly when the profile cache is missing', () => {
    const out = getStaffWithExtras({
      profile: null,
      productionCount: 0,
      voiceCount: 0,
    });
    expect(out.name).toBe('');
    expect(out.aliases).toEqual([]);
    expect(out.extlinks).toEqual([]);
    expect(out.lang).toBeNull();
    expect(out.gender).toBeNull();
  });
});

describe('formatCreditCountSummary', () => {
  it('substitutes both placeholders', () => {
    expect(formatCreditCountSummary('{prod} VN · {va} voice', 3, 7)).toBe('3 VN · 7 voice');
  });

  it('keeps the order of placeholders independent of arg order', () => {
    expect(formatCreditCountSummary('{va} voix / {prod} VN', 4, 9)).toBe('9 voix / 4 VN');
  });
});
