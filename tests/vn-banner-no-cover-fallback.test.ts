import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const vnPageSource = readFileSync(
  join(__dirname, '..', 'src/app/vn/[id]/page.tsx'),
  'utf8',
);

describe('VN hero banner source', () => {
  it('does not use the cover as an implicit banner fallback', () => {
    expect(vnPageSource).toContain('const bannerSource = vn.banner_image;');
    expect(vnPageSource).not.toContain('const bannerSource = vn.banner_image || vn.local_image || vn.image_url;');
  });
});
