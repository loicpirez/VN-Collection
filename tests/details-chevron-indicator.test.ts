/**
 * R5-155 pin: `<details>` summaries explicitly show a chevron
 * indicator (so the open / closed state is readable across
 * browsers, not subject to whatever default disclosure marker
 * the engine ships) AND mark their parent `<details>` with
 * `group` so the chevron can rotate via Tailwind's
 * `group-open:` variant.
 *
 * Touched surfaces (each named in the row):
 *   - data: src/app/data/page.tsx
 *   - schema: src/components/SchemaLocalSection.tsx
 *   - import: src/components/ImportPanel.tsx (×2 details blocks)
 *   - bulk: src/components/BulkDownloadButton.tsx,
 *           src/components/BulkActionBar.tsx
 *   - status: src/components/VndbStatusPanel.tsx
 *   - settings: src/components/SettingsButton.tsx
 *
 * Surfaces that already managed their own controlled `<details>`
 * with an explicit chevron (Characters / Releases / Quotes /
 * Relations sections, /vn/[id] titles details) keep their
 * existing pattern; this row is about the BARE `<details>` that
 * previously relied on the browser-default marker.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

const SURFACES = [
  'src/app/data/page.tsx',
  'src/components/SchemaLocalSection.tsx',
  'src/components/ImportPanel.tsx',
  'src/components/BulkDownloadButton.tsx',
  'src/components/BulkActionBar.tsx',
  'src/components/VndbStatusPanel.tsx',
  'src/components/SettingsButton.tsx',
];

describe('CollapsibleSummary — R5-155 chevron primitive', () => {
  it('CollapsibleSummary exists and uses group-open:rotate-90', () => {
    const src = readFileSync(
      join(ROOT, 'src/components/CollapsibleSummary.tsx'),
      'utf8',
    );
    expect(src).toMatch(/export function CollapsibleSummary/);
    expect(src).toMatch(/group-open:rotate-90/);
    expect(src).toMatch(/from\s+['"]lucide-react['"]/);
  });
});

describe('R5-155 — every named `<details>` surface adopts the chevron pattern', () => {
  for (const rel of SURFACES) {
    it(`${rel} imports CollapsibleSummary and uses <details className="group">`, () => {
      const src = readFileSync(join(ROOT, rel), 'utf8');
      expect(src, `${rel} must import CollapsibleSummary`).toMatch(/CollapsibleSummary/);
      expect(src, `${rel} must mark its <details> with the \`group\` class`).toMatch(/<details\b[^>]*className="[^"]*\bgroup\b/);
      // Every summary must hide the default disclosure marker so
      // the chevron is the only open-state cue.
      expect(src, `${rel} must hide the native disclosure marker`).toMatch(/\[&::-webkit-details-marker\]:hidden/);
    });
  }
});
