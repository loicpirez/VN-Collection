import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(process.cwd(), 'src/components/RelationsSection.tsx'), 'utf8');

describe('RelationsSection density', () => {
  it('uses the shared card density CSS variable for relation cards', () => {
    expect(SOURCE).toContain('var(--card-density-px, 220px)');
    expect(SOURCE).toContain('gridTemplateColumns');
  });

  it('keeps relation cards memoized with stable data projection', () => {
    expect(SOURCE).toContain('const relationCache = new WeakMap<EnrichedRelation, CardData>()');
    expect(SOURCE).toContain('const RelationCard = memo');
  });
});
