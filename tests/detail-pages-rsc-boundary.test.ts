/**
 * Source-pin contract for `/character/[id]`, `/staff/[id]`,
 * `/producer/[id]` pages. These are server components that pass
 * `sections: DetailSection[]` to the client `<DetailReorderLayout>`.
 *
 * The known failure mode is the React/Next.js error:
 *   "Functions cannot be passed directly to Client Components"
 *
 * which fires when a server component passes a function value as a
 * direct prop to a `'use client'` component. The fix is twofold:
 *
 *   1. Section list is `DetailSection[]` where each item has only
 *      `id`, `node` (ReactNode), and an optional `label` (string).
 *      No function/callback fields.
 *   2. The page emits the layout-editor trigger as `LayoutChip`
 *      (already a client component) rather than passing a callback
 *      to one.
 *
 * Pin both invariants so a future refactor that re-introduces
 * `onSave`, `onChange`, or similar function props can't ship.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

const PAGES = [
  'src/app/character/[id]/page.tsx',
  'src/app/staff/[id]/page.tsx',
  'src/app/producer/[id]/page.tsx',
];

describe('detail pages — RSC boundary safety', () => {
  it.each(PAGES)('uses DetailReorderLayout with sections={...}, no function props', (rel) => {
    const src = read(rel);
    // The DetailReorderLayout call must NOT receive any function-
    // valued prop directly. Match the attribute names we know are
    // ALLOWED, then assert no `onXxx={` or `Fn={` style props
    // appear between the opening tag and the closing `/>`.
    const match = src.match(/<DetailReorderLayout([\s\S]*?)\/?>/);
    expect(match, `${rel} must render <DetailReorderLayout>`).toBeTruthy();
    const attrs = (match?.[1] ?? '').trim();
    // Allow exactly the documented set of attributes. Future
    // attributes should be added here intentionally after the
    // boundary review.
    const ALLOWED = ['sections', 'initialLayout', 'sectionIds', 'settingsKey', 'eventName'];
    const presentAttrs = Array.from(attrs.matchAll(/(\w+)=/g)).map((m) => m[1]);
    for (const attr of presentAttrs) {
      expect(ALLOWED).toContain(attr);
    }
    // No `on*=` style handler-shaped attrs.
    expect(attrs).not.toMatch(/\bon[A-Z]\w*=/);
  });

  it.each(PAGES)('section list never spreads functions into node props', (rel) => {
    const src = read(rel);
    // A common regression is `node: <Foo onClick={() => …} />`
    // inside the page itself — even though React renders that on
    // the server, the function value cannot cross the RSC payload
    // boundary if `Foo` is a client component. Heuristic: no inline
    // arrow function literal inside a section push expression.
    //
    // The check is permissive: we only flag patterns that
    // demonstrably allocate a function inline INSIDE a `node:`
    // value. Server components like SafeImage / SectionFrame
    // already have their own client/server split.
    const sectionPushes = src.split('Sections.push(');
    // First entry is everything before the first push call — skip it.
    for (const chunk of sectionPushes.slice(1)) {
      // Take the chunk up to the matching close paren on first ');'
      const close = chunk.indexOf(');');
      const body = close > -1 ? chunk.slice(0, close) : chunk;
      // Allowlist: inline arrow / function literal must not appear
      // between an `on[A-Z]…={` and `}` inside the node JSX.
      // We just check there's no `on[A-Z]…={(` shape — that pattern
      // indicates a function prop being defined inline at the
      // server-component layer.
      expect(body).not.toMatch(/on[A-Z]\w*=\{\(/);
    }
  });
});
