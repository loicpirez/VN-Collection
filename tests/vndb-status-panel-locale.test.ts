/**
 * R5-197 + R5-198 pin: the VNDB status panel + the shared
 * `DateInput` primitive obey the row's contracts.
 *
 * R5-198 (date locale):
 *   - `DateInput` formats via `Intl.DateTimeFormat(tag, …)`
 *     where `tag` is derived from the app locale (`fr` →
 *     `fr-FR`, `en` → `en-GB`, `ja` → `ja-JP`), NOT
 *     `navigator.language` or the OS locale.
 *   - The on-wire payload is always ISO `YYYY-MM-DD` (the
 *     `toIso` helper pads month/day with `0`).
 *
 * R5-197 (panel separation + safety):
 *   - The panel shows the local collection status, the VNDB
 *     labels (`labels` array from the API), and the wishlist
 *     label (id 7 special-cased out of the togglable set —
 *     wishlist owns its own surface elsewhere).
 *   - `VndbStatusPanel` reads dates through `DateInput`
 *     (locale-respecting) and stores ISO via `value` props.
 *   - The route never logs the user's VNDB token — the token
 *     is read server-side from the settings store and used
 *     only as an `Authorization: Token …` header.
 *   - Refresh is context-specific: the panel re-fetches its
 *     OWN endpoint (`/api/vn/<id>/vndb-status`), not the
 *     site-wide `/api/refresh/global`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const DATE_INPUT = readFileSync(join(ROOT, 'src/components/DateInput.tsx'), 'utf8');
const PANEL = readFileSync(join(ROOT, 'src/components/VndbStatusPanel.tsx'), 'utf8');
const ROUTE = readFileSync(join(ROOT, 'src/app/api/vn/[id]/vndb-status/route.ts'), 'utf8');

describe('R5-198 — DateInput uses app locale + ISO wire format', () => {
  it('imports the shared BCP47 map (canonical fr-FR / en-US / ja-JP tags)', () => {
    // U-034: the per-component LOCALE_TAG constant was replaced by the
    // canonical `BCP47` map in `lib/locale-number.ts`. Verify the import
    // is wired up and the canonical map carries the expected tags.
    expect(DATE_INPUT).toMatch(/import\s*\{[^}]*BCP47[^}]*\}\s+from\s+['"]@\/lib\/locale-number['"]/);
    const LOCALE_NUMBER = readFileSync(join(ROOT, 'src/lib/locale-number.ts'), 'utf8');
    expect(LOCALE_NUMBER).toMatch(/fr:\s*['"]fr-FR['"]/);
    expect(LOCALE_NUMBER).toMatch(/en:\s*['"]en-US['"]/);
    expect(LOCALE_NUMBER).toMatch(/ja:\s*['"]ja-JP['"]/);
  });

  it('Intl.DateTimeFormat is called with the locale tag, not navigator.language', () => {
    expect(DATE_INPUT).toMatch(/Intl\.DateTimeFormat\(tag/);
    expect(DATE_INPUT).not.toMatch(/Intl\.DateTimeFormat\(navigator/);
  });

  it('toIso pads YYYY-MM-DD; storage stays ISO', () => {
    expect(DATE_INPUT).toMatch(/function toIso/);
    expect(DATE_INPUT).toMatch(/return\s+`\$\{date\.getFullYear\(\)\}-\$\{pad\(date\.getMonth\(\) \+ 1\)\}-\$\{pad\(date\.getDate\(\)\)\}`/);
  });
});

describe('R5-197 — VndbStatusPanel separation + safety', () => {
  it('renders DateInput (locale-respecting) for both started + finished fields', () => {
    expect(PANEL).toMatch(/<DateInput\b/);
    // started + finished should both use it.
    const count = (PANEL.match(/<DateInput\b/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('separates the wishlist label (id 7) from the togglable label set', () => {
    expect(PANEL).toMatch(/state\.labels\.filter\(\(l\)\s*=>\s*l\.id\s*!==\s*7\)/);
  });

  it('refresh re-fetches /api/vn/<id>/vndb-status, not /api/refresh/global', () => {
    expect(PANEL).not.toMatch(/\/api\/refresh\/global/);
    expect(PANEL).toMatch(/\/api\/vn\/\$\{vnId\}\/vndb-status/);
  });
});

describe('R5-197 — vndb-status route never logs the token', () => {
  it('no console.log / console.error of the token surface', () => {
    expect(ROUTE).not.toMatch(/console\.[a-z]+\([^)]*token/i);
  });

  it('token reaches VNDB as an `Authorization: Token …` header only', () => {
    // The route helper itself doesn't construct the header — that
    // happens inside `vndb-sync.ts` / vndb-cache. Sanity-check that
    // the route doesn't echo the token into a response body.
    expect(ROUTE).not.toMatch(/token:\s*[A-Za-z_]/);
  });
});
