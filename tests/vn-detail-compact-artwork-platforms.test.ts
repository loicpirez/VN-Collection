import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('VN detail compact artwork and platform disclosure', () => {
  it('keeps artwork overlays off compact covers and exposes one responsive toolbar entry', () => {
    const overlay = source('src/components/CoverEditOverlay.tsx');
    const menu = source('src/components/ArtworkActionMenu.tsx');
    const hero = source('src/components/HeroBanner.tsx');
    expect(overlay).toContain('hidden min-h-[44px]');
    expect(overlay).toContain('can-hover:sm:min-h-[36px]');
    expect(overlay).toContain('md:inline-flex');
    expect(menu).toContain('sr-only sm:not-sr-only');
    expect(menu).toContain('<PortalPopover');
    expect(hero).not.toContain('aria-label={t.banner.adjust}\n                  >\n                  <Crosshair className="h-3.5 w-3.5"');
  });

  it('keeps one resident lazy artwork owner mounted outside the collapsible media menu', () => {
    const actions = source('src/components/VnDetailActionsBar.tsx');
    const picker = source('src/components/CoverSourcePicker.tsx');
    const trigger = source('src/components/CoverPickerTrigger.tsx');

    expect(actions).toContain('const artworkPickers = (');
    expect(actions).toContain('<LazyArtworkPickers');
    expect(actions).toContain('<CoverPickerTrigger vnId={vn.id} className={ACTION_BUTTON_CLASSES} />');
    expect(actions).toContain('<BannerPickerTrigger vnId={vn.id} className={ACTION_BUTTON_CLASSES} />');
    expect(actions).toContain('<ArtworkTransformControls vnId={vn.id} />');
    expect(actions).toContain('{artworkPickers}');
    expect(actions).not.toContain('{coverPicker}');
    expect(picker).toContain('{showTrigger && (');
    expect(trigger).toContain("window.dispatchEvent(new CustomEvent('vn:open-cover-picker', { detail: { vnId } }))");
  });

  it('routes empty cover and banner states to the resident source pickers', () => {
    const page = source('src/app/vn/[id]/page.tsx');
    const hero = source('src/components/HeroBanner.tsx');
    expect(page).toContain('label={t.cover.uploadCta}');
    expect(page).not.toContain('<CoverUploader');
    expect(hero).toContain('label={t.banner.uploadCta}');
    expect(hero).toContain('!liveSrc && currentInCollection');
  });

  it('exposes truncated platform names through a shared click and keyboard popover', () => {
    const body = source('src/app/vn/[id]/page.tsx');
    const disclosure = source('src/components/PlatformOverflowDisclosure.tsx');
    expect(body).toContain('<PlatformOverflowDisclosure');
    expect(body).toContain('items={vn.platforms.slice(10).map((code) => ({');
    expect(disclosure).toContain('aria-expanded={open}');
    expect(disclosure).toContain('aria-haspopup="dialog"');
    expect(disclosure).toContain('min-h-[44px]');
    expect(disclosure).toContain('sm:min-h-[28px]');
    expect(disclosure).toContain('<PortalPopover');
    expect(disclosure).toContain('href={`/search?platforms=${encodeURIComponent(item.code)}`}');
    expect(disclosure).not.toContain('group-hover');
  });
});
