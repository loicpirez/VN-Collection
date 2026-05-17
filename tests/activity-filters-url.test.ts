import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

/**
 * Source-pin every `/activity` page filter to the URL.
 *
 * The `/activity` page is server-rendered: filters arrive via the
 * `searchParams` prop, not `useSearchParams`. We pin the four filter
 * names (q, kind, entity, plus the GET form method so the inputs
 * round-trip via the browser query string) so a future refactor to
 * `useState` would visibly fail this test instead of silently breaking
 * deep-linking.
 */
const PAGE = 'src/app/activity/page.tsx';

describe('/activity URL filter wiring', () => {
  it('derives every filter from searchParams (server side)', async () => {
    const src = await readFile(PAGE, 'utf8');
    expect(src).toContain('searchParams');
    expect(src).toContain("first(sp.q)");
    expect(src).toContain("first(sp.kind)");
    expect(src).toContain("first(sp.entity)");
  });

  it('renders a method=get form so filters land in the URL', async () => {
    const src = await readFile(PAGE, 'utf8');
    expect(src).toMatch(/method="get"/);
    // The three filter inputs MUST have `name="q"|"kind"|"entity"` so
    // the browser serialises them back into the URL on submit.
    expect(src).toMatch(/name="q"/);
    expect(src).toMatch(/name="kind"/);
    expect(src).toMatch(/name="entity"/);
  });

  it('passes filters into listUserActivity', async () => {
    const src = await readFile(PAGE, 'utf8');
    // The page must thread q/kind/entity into the DB query, not just
    // echo them back to the form. Without this assertion a future
    // refactor could keep the inputs but drop the query wiring and
    // every search would silently return the unfiltered list.
    expect(src).toContain('listUserActivity({');
    expect(src).toContain('q:');
    expect(src).toContain('kind:');
    expect(src).toContain('entity:');
  });
});
