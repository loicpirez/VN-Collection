/**
 * Lint-style scan over the per-credit / per-staff rendering surfaces:
 * every clickable metadata token (gender, language, role, year, …)
 * MUST be wrapped in either a `<Link>` or `<a href>` so the operator
 * can drill down to the matching filter.
 *
 * The test reads each component as a string and asserts the presence
 * of the routing patterns. It deliberately doesn't render React — the
 * goal is to catch the regression where a chip slips back to a `<span>`
 * (no affordance) during a future refactor.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(relativePath: string): string {
  return readFileSync(resolve(__dirname, '..', relativePath), 'utf8');
}

describe('staff/[id] header clickability', () => {
  const src = read('src/app/staff/[id]/page.tsx');

  it('wraps the gender chip in a <Link> to /staff?sex=', () => {
    expect(src).toMatch(/href=\{[^}]*\/staff\?sex=/);
  });

  it('wraps the language chip in a <Link> to /staff?lang=', () => {
    expect(src).toMatch(/href=\{[^}]*\/staff\?lang=/);
  });

  it('exposes a year link on the per-credit row (yearMin/yearMax pair)', () => {
    expect(src).toMatch(/yearMin=/);
    expect(src).toMatch(/yearMax=/);
  });

  it('production-credits & voice-credits sections expose anchor ids', () => {
    // After the section-layout rework (item 15) the literal `id=`
    // attribute moves into the `<DetailSectionFrame anchor="…">`
    // prop, which renders it on the section element. Pin the
    // `anchor` prop value so the source still anchors deep links
    // from the header chips.
    expect(src).toMatch(/anchor="production-credits"/);
    expect(src).toMatch(/anchor="voice-credits"/);
  });
});

describe('StaffSection role headers are clickable', () => {
  const src = read('src/components/StaffSection.tsx');
  it('wraps the role label in a <Link> to /staff?role=', () => {
    expect(src).toMatch(/href=\{`\/staff\?role=/);
  });
});

describe('CastSection links character and staff', () => {
  const src = read('src/components/CastSection.tsx');
  it('character name links to /character/<id>', () => {
    expect(src).toMatch(/href=\{`\/character\//);
  });
  it('seiyuu name links to /staff/<id>', () => {
    expect(src).toMatch(/href=\{`\/staff\//);
  });
});
