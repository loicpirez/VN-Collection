/**
 * R5-058 / R5-106 / R5-215 — pin the scoped-refresh primitive +
 * the per-page migrations.
 *
 * The previous `RefreshPageButton` posted to `/api/refresh/global`
 * from every browse / discovery surface. That busted EVERY
 * page-level cache (stats, schema, authinfo, every release, every
 * producer, every tag/trait, every top-ranked surface) plus
 * re-fetched them in a long fan-out. The user complaint:
 * clicking "Refresh" on `/tags`, `/traits`, `/upcoming?tab=
 * anticipated`, `/top-ranked`, or `/schema` should refresh ONLY
 * that page's relevant cache rows.
 *
 * Two parts:
 *   1. Behaviour — `resolveScopePatterns(scopeId, params)` returns
 *      the right cache-key LIKE patterns for each scope and
 *      rejects unknown scopes / unbound params / unsafe param
 *      values.
 *   2. Sweep — each migrated call site mounts
 *      `<RefreshScopeButton scope="..."/>` (not
 *      `<RefreshPageButton/>`).
 */
import { describe, expect, it } from 'vitest';
import { REFRESH_SCOPES, resolveScopePatterns } from '@/lib/refresh-scopes';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('resolveScopePatterns — R5-058 behaviour', () => {
  it('returns the registered patterns for a known scope', () => {
    expect(resolveScopePatterns('tags-list')).toEqual(['% /tag|%', 'tag_full:%']);
    expect(resolveScopePatterns('traits-list')).toEqual(['% /trait|%', 'trait_full:%']);
    expect(resolveScopePatterns('upcoming-anticipated')).toEqual(['egs:anticipated:%']);
    expect(resolveScopePatterns('upcoming-collection')).toEqual(['% /release:upcoming|%']);
    expect(resolveScopePatterns('upcoming-all')).toEqual(['% /release:upcoming-all|%']);
    expect(resolveScopePatterns('top-ranked')).toEqual(['% /vn:top-ranked:%', 'egs:top-ranked:%']);
    expect(resolveScopePatterns('schema')).toEqual(['% /schema|%']);
  });

  it('substitutes {param} placeholders for the tag-detail scope', () => {
    expect(resolveScopePatterns('tag-detail', { gid: 'g73' })).toEqual([
      'tag_full:g73',
      'scrape_tag:g73',
    ]);
  });

  it('throws on unknown scope id', () => {
    expect(() => resolveScopePatterns('does-not-exist')).toThrowError(/unknown refresh scope/);
  });

  it('throws when a templated placeholder is unbound', () => {
    expect(() => resolveScopePatterns('tag-detail')).toThrowError(/missing param gid/);
    expect(() => resolveScopePatterns('tag-detail', {})).toThrowError(/missing param gid/);
  });

  it('rejects unsafe LIKE metacharacters in param values', () => {
    // `%`, `_`, `|`, and other LIKE metacharacters must not be allowed
    // to widen the bust pattern at runtime.
    expect(() => resolveScopePatterns('tag-detail', { gid: 'g73%' })).toThrowError(/unsafe param value/);
    expect(() => resolveScopePatterns('tag-detail', { gid: 'g_73' })).toThrowError(/unsafe param value/);
    expect(() => resolveScopePatterns('tag-detail', { gid: 'g73|x' })).toThrowError(/unsafe param value/);
  });

  it('every registered scope has an i18nKey', () => {
    for (const [id, scope] of Object.entries(REFRESH_SCOPES)) {
      expect(scope.i18nKey, `scope ${id} missing i18nKey`).toMatch(/^[a-zA-Z]+$/);
      expect(scope.patterns.length, `scope ${id} has no patterns`).toBeGreaterThan(0);
    }
  });
});

describe('R5-058 / R5-106 / R5-215 sweep — migrated call sites', () => {
  it('TagsBrowser mounts RefreshScopeButton scope="tags-list"', () => {
    const src = readFileSync(join(ROOT, 'src/components/TagsBrowser.tsx'), 'utf8');
    expect(src).not.toMatch(/import\s*\{\s*RefreshPageButton\s*\}/);
    expect(src).toMatch(/<RefreshScopeButton\s+scope="tags-list"/);
  });

  it('TraitsBrowser mounts RefreshScopeButton scope="traits-list"', () => {
    const src = readFileSync(join(ROOT, 'src/components/TraitsBrowser.tsx'), 'utf8');
    expect(src).not.toMatch(/import\s*\{\s*RefreshPageButton\s*\}/);
    expect(src).toMatch(/<RefreshScopeButton\s+scope="traits-list"/);
  });

  it('Upcoming page mounts the right scope per tab', () => {
    const src = readFileSync(join(ROOT, 'src/app/upcoming/page.tsx'), 'utf8');
    expect(src).not.toMatch(/import\s*\{\s*RefreshPageButton\s*\}/);
    expect(src).toMatch(/scope="upcoming-anticipated"/);
    expect(src).toMatch(/scope="upcoming-all"/);
    expect(src).toMatch(/scope="upcoming-collection"/);
  });

  it('Top-ranked page mounts RefreshScopeButton scope="top-ranked"', () => {
    const src = readFileSync(join(ROOT, 'src/app/top-ranked/page.tsx'), 'utf8');
    expect(src).not.toMatch(/import\s*\{\s*RefreshPageButton\s*\}/);
    expect(src).toMatch(/<RefreshScopeButton\s+scope="top-ranked"/);
  });

  it('Schema page mounts RefreshScopeButton scope="schema"', () => {
    const src = readFileSync(join(ROOT, 'src/app/schema/page.tsx'), 'utf8');
    expect(src).not.toMatch(/import\s*\{\s*RefreshPageButton\s*\}/);
    expect(src).toMatch(/<RefreshScopeButton\s+scope="schema"/);
  });
});

describe('R5-215 — i18n surface', () => {
  it('every registered scope has fr/en/ja label strings', async () => {
    const { dictionaries } = await import('@/lib/i18n/dictionaries');
    for (const locale of ['fr', 'en', 'ja'] as const) {
      const dict = dictionaries[locale];
      const scopeDict = (dict as unknown as { refreshScope?: Record<string, { cta?: string; title?: string }> }).refreshScope ?? {};
      for (const id of Object.keys(REFRESH_SCOPES)) {
        const i18nKey = REFRESH_SCOPES[id].i18nKey;
        const entry = scopeDict[i18nKey];
        expect(entry, `${locale}.refreshScope.${i18nKey} missing for scope ${id}`).toBeDefined();
        expect(typeof entry?.cta, `${locale}.refreshScope.${i18nKey}.cta must be a string`).toBe('string');
        expect(typeof entry?.title, `${locale}.refreshScope.${i18nKey}.title must be a string`).toBe('string');
      }
    }
  });
});
