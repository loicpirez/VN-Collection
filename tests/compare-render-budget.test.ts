import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/app/compare/page.tsx', 'utf8');

describe('compare render budget', () => {
  it('keeps compared VN and rich cell collections strictly bounded', () => {
    expect(source).toContain('.slice(0, 4)');
    expect(source).toContain('item.tags.filter((tag) => tag.spoiler === 0).slice(0, 14)');
    expect(source).toContain('item.staff.slice(0, 8)');
    expect(source).toContain('.slice(0, 10)');
  });

  it('defers offscreen layout and keeps images on the shared SafeImage path', () => {
    expect(source.match(/\[content-visibility:auto\]/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source).toContain('[contain-intrinsic-size:auto_760px]');
    expect(source).toContain('[contain-intrinsic-size:auto_1050px]');
    expect(source).toContain('<SafeImage');
  });
});
