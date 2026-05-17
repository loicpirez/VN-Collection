/**
 * `pickLoadingView` — central guard against the "flash empty before
 * fetch resolves" bug that the acceptance gate flagged.
 *
 * The decision table is locked here so every async section across
 * /search, /recommendations, /top-ranked, /upcoming, /egs, /dumped,
 * staff / producer / series / character / VN detail follows the
 * same rule: skeleton until the first fetch lands, then either
 * empty-state copy or the content.
 */
import { describe, expect, it } from 'vitest';
import {
  INITIAL_LOADING_STATE,
  pickLoadingView,
} from '@/lib/loading-state';

describe('INITIAL_LOADING_STATE', () => {
  it('defaults to "not yet loaded once" so the first render shows a skeleton', () => {
    expect(INITIAL_LOADING_STATE).toEqual({ loading: false, hasLoadedOnce: false });
  });
});

describe('pickLoadingView', () => {
  it('returns skeleton while the first fetch is in flight', () => {
    expect(pickLoadingView({ loading: true, hasLoadedOnce: false }, null)).toBe('skeleton');
    expect(pickLoadingView({ loading: true, hasLoadedOnce: false }, [])).toBe('skeleton');
  });

  it('returns skeleton while pre-mount even when loading is false', () => {
    // The bug we are guarding against: a component freshly mounted
    // with `loading=false` and `data=null` must not render the
    // empty state — it must show a skeleton until the first fetch
    // either resolves or errors.
    expect(pickLoadingView({ loading: false, hasLoadedOnce: false }, null)).toBe('skeleton');
    expect(pickLoadingView({ loading: false, hasLoadedOnce: false }, [])).toBe('skeleton');
  });

  it('returns empty only after at least one fetch resolved with no data', () => {
    expect(pickLoadingView({ loading: false, hasLoadedOnce: true }, [])).toBe('empty');
  });

  it('returns content when data is non-empty post-load', () => {
    expect(pickLoadingView({ loading: false, hasLoadedOnce: true }, [1, 2, 3])).toBe('content');
  });

  it('returns skeleton on a subsequent fetch even after a prior resolve', () => {
    // E.g. user added a tag on /recommendations — the next fetch
    // should not flash the previous empty state.
    expect(pickLoadingView({ loading: true, hasLoadedOnce: true }, [])).toBe('skeleton');
    expect(pickLoadingView({ loading: true, hasLoadedOnce: true }, [1])).toBe('skeleton');
  });

  it('respects the gated escape hatch so a closed <details> never renders a skeleton', () => {
    expect(pickLoadingView({ loading: false, hasLoadedOnce: false }, null, { gated: true })).toBe('idle');
    expect(pickLoadingView({ loading: true, hasLoadedOnce: false }, null, { gated: true })).toBe('idle');
  });

  it('treats null data after resolve as still-loading (defensive — the fetcher should have set [])', () => {
    expect(pickLoadingView({ loading: false, hasLoadedOnce: true }, null)).toBe('skeleton');
  });
});
