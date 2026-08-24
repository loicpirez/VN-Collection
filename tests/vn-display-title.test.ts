import { describe, expect, it } from 'vitest';
import { resolveVnDisplayTitles, type VnDisplayTitleInput } from '@/lib/vn-display-title';

function input(overrides: Partial<VnDisplayTitleInput> = {}): VnDisplayTitleInput {
  return {
    title: 'Complete title',
    alttitle: null,
    titles: [],
    ...overrides,
  };
}

describe('resolveVnDisplayTitles', () => {
  it('promotes the shortest full title containing a truncated cached title', () => {
    expect(resolveVnDisplayTitles(input({
      title: 'Gakuen',
      alttitle: 'Josou Gakuen - Long subtitle',
      titles: [
        { title: 'Josou Gakuen', latin: null },
        { title: 'Josou Gakuen - Long subtitle', latin: null },
      ],
    }))).toEqual({ primary: 'Josou Gakuen', alternate: 'Josou Gakuen - Long subtitle' });
  });

  it('keeps the displaced cached title when the promoted candidate is the alternate title', () => {
    expect(resolveVnDisplayTitles(input({
      title: 'Gakuen',
      alttitle: 'Josou Gakuen',
    }))).toEqual({ primary: 'Josou Gakuen', alternate: 'Gakuen' });
  });

  it('keeps an already complete primary title and a distinct alternate', () => {
    expect(resolveVnDisplayTitles(input({
      title: '  Complete title  ',
      alttitle: 'Alternate title',
      titles: [{ title: 'Unrelated title', latin: null }],
    }))).toEqual({ primary: 'Complete title', alternate: 'Alternate title' });
  });

  it('removes a duplicate alternate and ignores empty title metadata', () => {
    expect(resolveVnDisplayTitles(input({
      title: 'Same title',
      alttitle: 'Same title',
      titles: [{ title: '   ', latin: null }],
    }))).toEqual({ primary: 'Same title', alternate: undefined });
  });

  it('uses the shortest non-empty candidate when the cached title is blank', () => {
    expect(resolveVnDisplayTitles(input({
      title: '   ',
      alttitle: null,
      titles: [
        { title: 'Longer title', latin: null },
        { title: 'Short', latin: '' },
      ],
    }))).toEqual({ primary: 'Short', alternate: undefined });
  });
});
