import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string): string => readFileSync(path, 'utf8');

describe('VN card grid stretch contract', () => {
  it('keeps sortable library and list wrappers stretchable', () => {
    expect(source('src/components/SortableGrid.tsx')).toContain(
      'relative flex min-h-0 w-full min-w-0 items-stretch',
    );
    const listGrid = source('src/components/ListReorderGrid.tsx');
    expect(listGrid).toContain('relative flex min-h-0 w-full min-w-0 items-stretch');
    expect(listGrid).toContain('w-full flex-1 self-stretch flex-col');
  });

  it('keeps paginated list, series, and relation wrappers stretchable', () => {
    const wrapperClass = 'flex min-h-0 min-w-0 items-stretch';
    expect(source('src/app/lists/[id]/page.tsx')).toContain(wrapperClass);
    expect(source('src/app/series/[id]/page.tsx')).toContain(wrapperClass);
    expect(source('src/components/RelationsSection.tsx')).toContain(wrapperClass);
  });
});
