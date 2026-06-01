import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('page-space overflow ownership', () => {
  it('does not hide horizontal overflow at the global page frame', () => {
    const css = source('src/app/globals.css');
    const pageSpaceRule = /\.page-space-frame\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? '';
    expect(pageSpaceRule).not.toContain('overflow-x');
  });

  it('keeps wide shelf surfaces inside local scroll boundaries', () => {
    expect(source('src/components/ShelfScrollFrame.tsx')).toContain('className="overflow-x-auto overscroll-x-contain');
    expect(source('src/components/ShelfLayoutEditor.tsx')).toContain('className="scroll-fade-right overflow-x-auto');
  });
});
