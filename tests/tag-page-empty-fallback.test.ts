/**
 * Pin the empty-state CTA contract on the `/tag/[id]` page.
 *
 * When the local Library has zero VNs for the given tag the page
 * must surface an "Explorer sur VNDB" link so the user can pivot
 * to the canonical VNDB tag page instead of seeing a dead end.
 * The page renders the CTA via `tagPageEmptyState` which we test
 * as a pure helper.
 */
import { describe, expect, it } from 'vitest';
import { tagPageEmptyState } from '@/lib/tag-page-empty-state';

describe('tagPageEmptyState', () => {
  it('returns a CTA pointing at the VNDB tag page when the local count is 0', () => {
    const state = tagPageEmptyState({ tagId: 'g9001', collectionCount: 0 });
    expect(state.isEmpty).toBe(true);
    expect(state.vndbExternal).toBe('https://vndb.org/g9001');
    expect(state.fallbackLibrary).toBe('/?tag=g9001');
  });

  it('returns non-empty state when the collection has at least one VN', () => {
    const state = tagPageEmptyState({ tagId: 'g9001', collectionCount: 7 });
    expect(state.isEmpty).toBe(false);
    expect(state.vndbExternal).toBe('https://vndb.org/g9001');
  });

  it('lowercases the tag id so paths stay canonical', () => {
    const state = tagPageEmptyState({ tagId: 'G9002', collectionCount: 0 });
    expect(state.vndbExternal).toBe('https://vndb.org/g9002');
    expect(state.fallbackLibrary).toBe('/?tag=g9002');
  });
});
