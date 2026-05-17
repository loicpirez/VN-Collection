/**
 * Decide what the `/recommendations?mode=similar-to-vn` page must
 * render in its content area.
 *
 * Three branches:
 *   1. `empty`   — no `?seed=` set at all. Page shows the in-page
 *      VN picker landing card; no instruction to edit the URL.
 *   2. `invalid` — `?seed=<id>` is set, the id passes the syntax
 *      regex, but no local row matches. Page shows the picker with
 *      an error chip explaining the invalid seed.
 *   3. `results` — seed resolves to a real local VN. Page renders
 *      the standard `ResultsPanel`.
 *
 * Kept in its own file so the contract can be unit-tested without
 * touching React. The page component imports the same helper for
 * its rendering switch.
 */
export type SimilarToVnView = 'empty' | 'invalid' | 'results';

export function pickSimilarToVnView(opts: {
  seedVnId: string | undefined;
  seedRowExists: boolean;
}): SimilarToVnView {
  if (!opts.seedVnId) return 'empty';
  return opts.seedRowExists ? 'results' : 'invalid';
}
