import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('empty states with icons', () => {
  it('renders informative empty states on recommendation and similar pages', () => {
    expect(source('src/app/recommendations/page.tsx')).toContain('<Lightbulb className="mx-auto mb-3 h-6 w-6 text-accent"');
    expect(source('src/app/similar/page.tsx')).toContain('<Sparkles className="mx-auto mb-3 h-6 w-6 text-accent"');
  });

  it('renders informative empty states on series and quotes pages', () => {
    expect(source('src/app/series/[id]/page.tsx')).toContain('<Bookmark className="mx-auto mb-3 h-6 w-6 text-accent"');
    expect(source('src/app/quotes/page.tsx')).toContain('<Quote className="mx-auto mb-3 h-6 w-6 text-accent"');
  });
});
