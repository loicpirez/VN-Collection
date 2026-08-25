import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('audited mobile touch targets', () => {
  it('keeps browse controls touch-safe without inflating desktop layouts', () => {
    const tags = source('src/components/TagsBrowser.tsx');
    const overlap = source('src/components/BrandOverlapPicker.tsx');
    const steam = source('src/app/steam/page.tsx');
    const wishlist = source('src/components/WishlistClient.tsx');

    expect(tags).toContain('inline-flex min-h-[44px] min-w-[44px] items-center justify-center');
    expect(tags).toContain('can-hover:sm:min-h-0 can-hover:sm:min-w-0');
    expect(overlap.match(/className="input h-11 py-0"/g)).toHaveLength(2);
    expect(steam).toContain('inline-flex min-h-[44px] min-w-[44px] max-w-full items-center line-clamp-1');
    expect(steam).toContain('can-hover:sm:min-h-0 can-hover:sm:min-w-0');
    expect(wishlist).toContain('inline-flex min-h-[44px] cursor-pointer items-center');
    expect(wishlist).toContain('can-hover:sm:min-h-0');
    expect(wishlist).toContain('className="h-5 w-5 shrink-0"');
    expect(wishlist.match(/className="input h-11 py-0 text-xs"/g)).toHaveLength(4);
  });
});
