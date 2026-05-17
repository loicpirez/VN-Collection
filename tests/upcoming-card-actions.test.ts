/**
 * Source-pin contract for the `/upcoming` card refactor:
 *   1. Every tab branch on `src/app/upcoming/page.tsx` mounts the
 *      shared `<UpcomingCard>` (so the affordance set can't drift
 *      between tabs).
 *   2. `<UpcomingCard>` itself wires the four required affordances:
 *      open-local, open-vndb, add-to-collection, map-egs-to-vndb.
 *
 * Static source scan only — no rendering needed. Affordances are
 * tagged with `data-affordance="…"` in the component so the test can
 * match by attribute literal without parsing TSX.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PAGE_SRC = readFileSync('src/app/upcoming/page.tsx', 'utf8');
const CARD_SRC = readFileSync('src/components/UpcomingCard.tsx', 'utf8');

describe('upcoming card actions', () => {
  it('upcoming page imports UpcomingCard', () => {
    expect(PAGE_SRC).toMatch(/from\s+'@\/components\/UpcomingCard'/);
  });

  it('upcoming page mounts <UpcomingCard> in BOTH the release section and the anticipated section', () => {
    // ReleasesSection branch (collection / all tabs).
    expect(PAGE_SRC).toMatch(/function ReleasesSection[\s\S]*?<UpcomingCard /);
    // AnticipatedSection branch.
    expect(PAGE_SRC).toMatch(/function AnticipatedSection[\s\S]*?<UpcomingCard /);
  });

  it('UpcomingCard renders the four required affordances', () => {
    expect(CARD_SRC).toMatch(/data-affordance="open-local"/);
    expect(CARD_SRC).toMatch(/data-affordance="open-vndb"/);
    expect(CARD_SRC).toMatch(/data-affordance="add-to-collection"/);
    expect(CARD_SRC).toMatch(/data-affordance="map-egs-to-vndb"/);
  });

  it('UpcomingCard wires the four affordance components', () => {
    // add-to-collection re-uses the existing AddMissingVnButton helper.
    expect(CARD_SRC).toMatch(/AddMissingVnButton/);
    // map-to-vndb uses the existing MapEgsToVndbButton.
    expect(CARD_SRC).toMatch(/MapEgsToVndbButton/);
    // open-vndb chip targets the canonical VNDB URL.
    expect(CARD_SRC).toMatch(/https:\/\/vndb\.org\//);
    // open-local target uses the internal /vn/ route.
    expect(CARD_SRC).toMatch(/\/vn\/\$\{resolvedVnId\}/);
  });
});
