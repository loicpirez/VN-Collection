/**
 * SANCTIONED QA fixture IDs (R5-220).
 *
 * `scripts/browser-qa.sh` and `scripts/browser-interactions.mjs`
 * need to drive specific routes (e.g. "a character with spoiler-
 * tagged traits", "a VN with `[spoiler]` BBCode in description") to
 * regression-pin user-reported bugs. Those features are not
 * synthesizable from scratch in `.qa` because they depend on the
 * shape of the operator's local collection snapshot.
 *
 * Rather than scatter real IDs across the QA scripts, this module
 * is the SINGLE PLACE in the repo where real VNDB IDs may live.
 * The IDs map a capability → an example record present in the
 * operator's `.qa/data/collection.db`. Any other test, doc, or
 * code file that references a real VN/character/staff/producer ID
 * is a hygiene violation flagged by
 * `tests/qa-no-real-ids-outside-fixtures.test.ts`.
 *
 * If the `.qa` snapshot is regenerated and the relevant entity is
 * no longer present, update the mapping below (do NOT re-spread
 * IDs across QA scripts).
 *
 * NOTE: real IDs only — no titles, no character names, no studio
 * names. The IDs themselves are pointers into a public dataset and
 * carry no copyrighted content.
 */
export const QA_IDS = Object.freeze({
  // Characters used to verify the detail page renders, no RSC
  // boundary crash, traits render, and same-name sibling section.
  // `c84419`: character with spoiler-tagged traits + voice credits.
  // `c90980`: EGS-only character (sparse layout).
  // `c69497`: character with spoiler in description.
  // `c1001`: low-level character (no spoiler context).
  CHARACTER_WITH_SPOILER_TRAITS: 'c84419',
  CHARACTER_EGS_ONLY: 'c90980',
  CHARACTER_DESCRIPTION_SPOILER: 'c69497',
  CHARACTER_BASIC: 'c1001',

  // Staff: `s12799` has aliases + voice credits; `s1073` is queried
  // in `scope=collection` mode.
  STAFF_WITH_ALIASES: 's12799',
  STAFF_COLLECTION_SCOPED: 's1073',

  // Producer with extlinks + works.
  PRODUCER_WITH_EXTLINKS: 'p604',

  // VNs:
  // - `v26180`: in collection, toolbar + media gallery anchor.
  // - `v28032`: similar-to-vn seed test fixture.
  // - `v4327`: BBCode `[spoiler]` in description.
  // - `v32132`: another BBCode spoiler fixture.
  // - `v5262`: third BBCode spoiler fixture.
  // - `v15446`: VNDB BBCode link normalization.
  VN_TOOLBAR: 'v26180',
  VN_SIMILAR_SEED: 'v28032',
  VN_SPOILER_BBCODE: 'v4327',
  VN_SPOILER_BBCODE_ALT: 'v32132',
  VN_SPOILER_BBCODE_3: 'v5262',
  VN_LINK_NORMALIZE: 'v15446',

  // Tags: `g660` for recently-viewed top-margin; `g578` for
  // KANA tag-filter shape + pagination.
  TAG_RECENTLY_VIEWED: 'g660',
  TAG_PAGINATION: 'g578',
});
