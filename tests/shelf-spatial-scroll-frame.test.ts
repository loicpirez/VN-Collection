import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const spatial = readFileSync(join(root, 'src/components/ShelfSpatialView.tsx'), 'utf8');
const frame = readFileSync(join(root, 'src/components/ShelfScrollFrame.tsx'), 'utf8');

describe('ShelfSpatialView overflow frame', () => {
  it('uses the dedicated scroll frame instead of the global always-on fade helper', () => {
    expect(spatial).toContain('ShelfScrollFrame');
    expect(spatial).not.toContain('scroll-fade-right overflow-x-auto');
  });

  it('aligns normal shelf rows and display rows to one shared track width', () => {
    expect(spatial).toContain('const SHELF_TRACK_WIDTH');
    expect(spatial).toContain('max(var(--shelf-cell-w-px, 120px), var(--shelf-front-size-px, 140px))');
    expect(spatial.match(/gridTemplateColumns: `repeat\(\$\{cols\}, minmax\(\$\{SHELF_TRACK_WIDTH\}/g) ?? []).toHaveLength(2);
    expect(spatial).not.toContain('repeat(${cols}, minmax(var(--shelf-front-size-px');
  });

  it('centers cards inside shared shelf tracks so wider display cards cannot extend the row width', () => {
    expect(spatial.match(/justifyItems: 'center'/g) ?? []).toHaveLength(2);
    expect(spatial).toContain("className=\"grid w-max\"");
    expect(spatial).toContain("className={`grid w-max ${between ? 'border-t border-accent-blue/20 pt-1' : ''}`}");
    expect(spatial).toContain('data-shelf-row-grid');
    expect(spatial).toContain('data-shelf-display-grid');
  });
});

describe('ShelfScrollFrame fade behavior', () => {
  it('measures the actual scroll edge before painting either fade', () => {
    expect(frame).toContain('scrollWidth');
    expect(frame).toContain('clientWidth');
    expect(frame).toContain('scrollLeft');
    expect(frame).toContain('ResizeObserver');
    expect(frame).toContain('data-shelf-scroll-frame');
    expect(frame).toContain('data-shelf-scroll-fade="left"');
    expect(frame).toContain('data-shelf-scroll-fade="right"');
  });

  it('does not use the unconditional global scroll-fade-right pseudo-element', () => {
    expect(frame).not.toContain('scroll-fade-right');
  });
});
