/**
 * R5-222 pin: every DetailSection push on /character, /staff, and
 * /producer pages carries a `label` from the corresponding i18n
 * `sectionLabels` map. Without labels, DetailReorderLayout's
 * collapse-by-default headers and edit-mode chevrons render
 * unlabeled — the operator sees a list of "drag handle | reset"
 * rows with no clue which section is which.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('detail pages — section labels threaded (R5-222)', () => {
  const PAGES: Array<{ rel: string; layoutNamespace: string }> = [
    { rel: 'src/app/character/[id]/page.tsx', layoutNamespace: 'characterLayout' },
    { rel: 'src/app/staff/[id]/page.tsx', layoutNamespace: 'staffLayout' },
    { rel: 'src/app/producer/[id]/page.tsx', layoutNamespace: 'producerLayout' },
  ];

  it.each(PAGES)('$rel reads sectionLabels from $layoutNamespace', ({ rel, layoutNamespace }) => {
    const src = read(rel);
    const re = new RegExp(`t\\.${layoutNamespace}\\.sectionLabels`);
    expect(src, `${rel} must read t.${layoutNamespace}.sectionLabels`).toMatch(re);
  });

  it.each(PAGES)('$rel: every Sections.push carries a label', ({ rel }) => {
    const src = read(rel);
    // Find every `<scope>Sections.push({` call and confirm the
    // captured object contains a `label:` key. The push expressions
    // span several lines so we walk until the matching `})`.
    const re = /(character|staff|producer)Sections\.push\(\{([\s\S]*?)\n\s{8}\}\)/g;
    let m: RegExpExecArray | null;
    let pushCount = 0;
    while ((m = re.exec(src))) {
      pushCount++;
      const body = m[2];
      expect(body, `${rel} Sections.push #${pushCount} missing label: ${body.slice(0, 80)}`).toMatch(/label:/);
    }
    expect(pushCount, `${rel} should declare ≥2 sections`).toBeGreaterThanOrEqual(2);
  });
});
