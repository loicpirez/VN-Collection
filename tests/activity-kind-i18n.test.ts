import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dictionaries } from '@/lib/i18n/dictionaries';

const PAGE = readFileSync('src/app/activity/page.tsx', 'utf8');

describe('/activity system-event presentation', () => {
  it('renders stable kind codes through the active dictionary', () => {
    expect(PAGE).toContain('systemKindLabel(row.kind, t)');
    expect(PAGE).toContain('systemKindLabel(k, t)');
    expect(PAGE).not.toContain("row.label || row.kind.replace(/_/g, ' ')");
  });

  it('keeps the translated event catalog aligned across locales', () => {
    const fr = dictionaries.fr.userActivity.systemKinds;
    const en = dictionaries.en.userActivity.systemKinds;
    const ja = dictionaries.ja.userActivity.systemKinds;
    expect(Object.keys(en)).toEqual(Object.keys(fr));
    expect(Object.keys(ja)).toEqual(Object.keys(fr));
    for (const catalog of [fr, en, ja]) {
      expect(Object.values(catalog).every((label) => label.trim().length > 0)).toBe(true);
    }
  });
});
