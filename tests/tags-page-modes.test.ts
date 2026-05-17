/**
 * Pin the URL-routing contract for the `/tags` (Local / VNDB) tab
 * strip and the `/tag/[id]` Local/VNDB tab routing. The helpers are
 * pure — no Next.js / DOM imports — so the test can assert the
 * shareable-URL behaviour without any runtime setup.
 */
import { describe, expect, it } from 'vitest';
import {
  parseTagPageParams,
  parseTagsPageParams,
  tagChipHref,
  tagPageTabHref,
  tagsPageHref,
} from '@/lib/tags-page-modes';

describe('parseTagsPageParams', () => {
  it('defaults to mode=local', () => {
    expect(parseTagsPageParams({}).mode).toBe('local');
  });

  it('reads mode=vndb', () => {
    expect(parseTagsPageParams({ mode: 'vndb' }).mode).toBe('vndb');
  });

  it('falls back to local for unknown values', () => {
    expect(parseTagsPageParams({ mode: 'bogus' }).mode).toBe('local');
    expect(parseTagsPageParams({ mode: ['vndb', 'local'] }).mode).toBe('vndb');
  });
});

describe('parseTagPageParams', () => {
  it('defaults to tab=local', () => {
    expect(parseTagPageParams({}).tab).toBe('local');
  });

  it('reads tab=vndb', () => {
    expect(parseTagPageParams({ tab: 'vndb' }).tab).toBe('vndb');
  });
});

describe('tagChipHref', () => {
  // Updated contract: every chip click lands on the per-tag detail
  // page so the operator gets description, parent/child tags, and
  // both Local + VNDB sub-tabs without first paying a round-trip
  // through the Library filter. The Library filter remains
  // reachable from the detail page.
  it('local mode lands on the per-tag detail page', () => {
    expect(tagChipHref('local', 'g9001')).toBe('/tag/g9001');
  });

  it('vndb mode lands on the per-tag detail page with the vndb sub-tab', () => {
    expect(tagChipHref('vndb', 'g9001')).toBe('/tag/g9001?tab=vndb');
  });

  it('lowercases the tag id so paths stay canonical', () => {
    expect(tagChipHref('local', 'G42')).toBe('/tag/g42');
    expect(tagChipHref('vndb', 'G42')).toBe('/tag/g42?tab=vndb');
  });
});

describe('tagsPageHref', () => {
  it('drops the query string in local mode', () => {
    expect(tagsPageHref('local')).toBe('/tags');
  });

  it('emits mode=vndb for the VNDB tab', () => {
    expect(tagsPageHref('vndb')).toBe('/tags?mode=vndb');
  });
});

describe('tagPageTabHref', () => {
  it('drops the query string in local tab', () => {
    expect(tagPageTabHref('g9001', 'local')).toBe('/tag/g9001');
  });

  it('emits tab=vndb for the VNDB sub-tab', () => {
    expect(tagPageTabHref('g9001', 'vndb')).toBe('/tag/g9001?tab=vndb');
  });

  it('lowercases the id so the tab URL stays canonical', () => {
    expect(tagPageTabHref('G42', 'local')).toBe('/tag/g42');
  });
});
