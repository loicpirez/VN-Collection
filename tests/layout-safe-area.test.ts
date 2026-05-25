import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');

describe('root layout safe area', () => {
  it('pads the sticky header for notched mobile displays', () => {
    expect(SOURCE).toContain("paddingTop: 'env(safe-area-inset-top)'");
  });
});
