import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

function layerValue(css: string, name: string): number {
  const match = css.match(new RegExp(`--z-layer-${name}: (\\d+);`));
  if (!match) throw new Error(`Missing z-layer ${name}`);
  return Number(match[1]);
}

describe('global UI layer scale', () => {
  it('defines one strictly ordered semantic z-index scale', () => {
    const css = source('src/app/globals.css');
    const names = [
      'map',
      'navigation',
      'fullscreen',
      'status',
      'popover',
      'modal',
      'toast',
      'confirmation',
      'accessibility',
    ];
    const values = names.map((name) => layerValue(css, name));

    expect(values).toEqual([0, 400, 500, 600, 700, 1000, 1100, 1200, 1300]);
    expect(values.every((value, index) => index === 0 || value > values[index - 1])).toBe(true);
    for (const name of names) {
      expect(css).toContain(`.z-layer-${name} { z-index: var(--z-layer-${name}); }`);
    }
  });

  it('assigns each global surface to its semantic layer', () => {
    expect(source('src/app/layout.tsx')).toContain('z-layer-navigation');
    expect(source('src/app/layout.tsx')).toContain('z-layer-accessibility');
    expect(source('src/components/ShelfSpatialFullscreen.tsx')).toContain('z-layer-fullscreen');
    expect(source('src/components/ShelfLayoutEditor.tsx')).toContain('z-layer-fullscreen');
    expect(source('src/components/DownloadStatusBar.tsx')).toContain('z-layer-status');
    expect(source('src/components/BulkActionBar.tsx')).toContain('z-layer-status');
    expect(source('src/components/MoreNavMenu.tsx')).toContain('z-layer-popover');
    expect(source('src/components/Dialog.tsx')).toContain('z-layer-modal');
    expect(source('src/components/AddEditPlaceModal.tsx')).toContain('z-layer-modal');
    expect(source('src/components/ToastProvider.tsx')).toContain('z-layer-toast');
    expect(source('src/components/ConfirmDialog.tsx')).toContain('z-layer-confirmation');
    expect(source('src/components/MapCanvas.tsx')).toContain('z-layer-map');
  });
});
