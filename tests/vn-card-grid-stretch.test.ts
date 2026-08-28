import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string): string => readFileSync(path, 'utf8');

describe('VN card grid stretch contract', () => {
  it('keeps sortable library and list wrappers stretchable', () => {
    expect(source('src/components/SortableGrid.tsx')).toContain(
      'relative flex min-h-0 w-full min-w-0 items-stretch self-stretch',
    );
    const listGrid = source('src/components/ListReorderGrid.tsx');
    expect(listGrid).toContain('relative flex min-h-0 w-full min-w-0 items-stretch self-stretch');
    expect(source('src/components/VnCard.tsx')).toContain(
      'h-full min-h-0 w-full flex-1 self-stretch flex-col',
    );
  });

  it('gives every library card an explicit Safari-stable stretching grid cell', () => {
    const library = source('src/components/LibraryClient.tsx');
    expect(library).toContain('className="flex min-h-0 min-w-0 items-stretch self-stretch"');
    expect(library).toContain('data-library-card-cell');
    expect(library).toContain('data-library-card-total={items.length}');
    expect(library).toContain('data-library-card-virtualization-threshold={virtualThreshold}');
    expect(library).not.toContain('if (!selectable)');
    expect(library).toContain('onSelect={selectable ? handle : undefined}');
  });

  it('keeps paginated list, series, and relation wrappers stretchable', () => {
    const wrapperClass = 'flex min-h-0 min-w-0 items-stretch self-stretch';
    expect(source('src/app/lists/[id]/page.tsx')).toContain(wrapperClass);
    expect(source('src/app/series/[id]/page.tsx')).toContain(wrapperClass);
    expect(source('src/components/RelationsSection.tsx')).toContain(wrapperClass);
  });

  it('wraps every direct shared-card grid child in a stretching cell', () => {
    for (const path of [
      'src/components/SearchClient.tsx',
      'src/components/WishlistClient.tsx',
      'src/app/tag/[id]/page.tsx',
    ]) {
      const body = source(path);
      expect(body, path).toContain('flex min-h-0 min-w-0 items-stretch self-stretch');
      expect(body, path).toContain('data-vn-card-cell');
    }
  });

  it('makes every shared VN card grid explicitly stretch its natural rows', () => {
    const sources = [
      'src/components/WishlistClient.tsx',
      'src/components/SearchClient.tsx',
      'src/components/SortableGrid.tsx',
      'src/app/lists/[id]/page.tsx',
      'src/app/series/[id]/page.tsx',
      'src/app/tag/[id]/page.tsx',
      'src/components/RelationsSection.tsx',
    ];
    for (const path of sources) {
      expect(source(path), path).toContain('grid items-stretch gap-');
    }
  });
});
