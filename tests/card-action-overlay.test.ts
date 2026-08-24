import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('shared card action overlay contract', () => {
  it('stays visible by default and hides only for hover-capable fine pointers', () => {
    const css = source('src/app/globals.css');
    expect(css).toContain('.card-action-overlay {');
    expect(css).toContain('@media (hover: hover) and (pointer: fine)');
    expect(css).toContain('.group .card-action-overlay {');
    expect(css).toContain('opacity: 0 !important;');
    expect(css).toContain('pointer-events: none;');
  });

  it('reveals actions for pointer hover and keyboard focus', () => {
    const css = source('src/app/globals.css');
    expect(css).toContain('.group:hover .card-action-overlay');
    expect(css).toContain('.group:focus-within .card-action-overlay');
    expect(css).toContain('.card-action-overlay:focus-visible');
    expect(css).toContain('opacity: 1 !important;');
    expect(css).toContain('pointer-events: auto;');
  });

  it('is used by every audited card action surface', () => {
    for (const path of [
      'src/components/VnCard.tsx',
      'src/components/ListCardActions.tsx',
      'src/components/MediaGallery.tsx',
      'src/components/CoverEditOverlay.tsx',
    ]) {
      expect(source(path), path).toContain('card-action-overlay');
    }
  });
});
