import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('responsive tap targets', () => {
  it('keeps VN detail action buttons and menus at touch-safe height', () => {
    const src = source('src/components/VnDetailActionsBar.tsx');
    expect(src).toContain('const ACTION_BUTTON_CLASSES');
    expect(src).toContain('min-h-[44px]');
    expect(src).toContain('[role="menuitem"]');
  });

  it('keeps media and cover adjustment controls touch-safe', () => {
    expect(source('src/components/MediaGallery.tsx')).toContain('min-h-[44px]');
    expect(source('src/components/CoverRotationButtons.tsx')).toContain('min-h-[44px]');
    expect(source('src/components/AspectOverrideControl.tsx')).toContain('min-h-[44px]');
  });

  it('keeps floating and input chip controls touch-safe', () => {
    expect(source('src/components/ToastProvider.tsx')).toContain('min-h-[44px]');
    expect(source('src/components/TagInput.tsx')).toContain('min-h-[44px]');
    expect(source('src/components/DateInput.tsx')).toContain('min-h-[44px]');
  });

  it('keeps detail reorder, density, mobile nav, and game-log controls touch-safe', () => {
    expect(source('src/components/DetailReorderLayout.tsx')).toContain('min-h-[44px]');
    expect(source('src/components/CardDensitySlider.tsx')).toContain('min-h-[44px]');
    expect(source('src/components/MoreNavMenu.tsx')).toContain('min-h-[44px]');
    expect(source('src/components/GameLog.tsx')).toContain('min-h-[44px]');
  });

  it('keeps settings tabs and per-page layout controls reachable on narrow screens', () => {
    const src = source('src/components/SettingsButton.tsx');
    expect(src).toContain('overflow-x-auto');
    expect(src).toContain('shrink-0');
    expect(src).toContain('min-h-[44px]');
  });
});
