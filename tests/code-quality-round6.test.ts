import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('round6 code-quality pins', () => {
  it('memoizes SortableGrid card projection per item prop', () => {
    const src = source('src/components/SortableGrid.tsx');
    expect(src).toContain("import { memo, useMemo, useState } from 'react'");
    expect(src).toContain('const data = useMemo(() => toCardData(item), [item])');
  });

  it('does not use non-null assertions for owned platform comparisons', () => {
    const src = source('src/components/EditionInfoPopover.tsx');
    expect(src).not.toContain('owned_platform!');
    expect(src).toContain('const otherPlatforms = data.rel_platforms.filter');
  });
});
