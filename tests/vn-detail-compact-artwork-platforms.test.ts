import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('VN detail compact artwork and platform disclosure', () => {
  it('keeps one icon-only cover edit entry on compact viewports', () => {
    const body = source('src/components/CoverEditOverlay.tsx');
    expect(body).toContain('min-h-[44px] min-w-[44px]');
    expect(body).toContain('<span className="hidden sm:inline">{t.coverPicker.open}</span>');
  });

  it('exposes truncated platform names through hover, focus, and tap disclosure', () => {
    const body = source('src/app/vn/[id]/page.tsx');
    expect(body).toContain('const hiddenPlatforms = vn.platforms.slice(10)');
    expect(body).toContain("title={hiddenLabels.join(', ')}");
    expect(body).toContain('className="absolute right-0 top-full z-20');
    expect(body).toContain('group-open:flex group-hover:flex group-focus-within:flex');
    expect(body).toContain('href={`/search?platforms=${encodeURIComponent(p)}`}');
  });
});
