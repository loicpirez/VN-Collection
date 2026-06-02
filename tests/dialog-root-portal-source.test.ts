import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('custom dialog root portal contract', () => {
  it('provides one body-level portal primitive for custom dialog layouts', () => {
    const dialog = source('src/components/Dialog.tsx');
    expect(dialog).toContain('export function DialogPortal');
    expect(dialog).toContain('return createPortal(children, document.body);');
  });

  it('keeps custom modal overlays out of local stacking contexts', () => {
    for (const path of [
      'src/components/CoverSourcePicker.tsx',
      'src/components/BannerSourcePicker.tsx',
      'src/components/MediaGallery.tsx',
      'src/components/LinkToVndbButton.tsx',
      'src/components/MapVnToEgsButton.tsx',
      'src/components/HomeLayoutEditorTrigger.tsx',
      'src/components/alicenet/AliceNetLinkDialog.tsx',
      'src/components/stock/ClearCacheModal.tsx',
    ]) {
      const body = source(path);
      expect(body, path).toContain('<DialogPortal>');
      expect(body, path).toContain('z-[1000]');
    }
    expect(source('src/components/AssignProviderDialog.tsx')).toContain('z-[1000]');
  });

  it('makes the clear-cache backdrop an explicit close target', () => {
    const modal = source('src/components/stock/ClearCacheModal.tsx');
    expect(modal).toContain('className="absolute inset-0 cursor-default bg-black/60"');
    expect(modal).toContain('onClick={onCancel}');
    expect(modal).not.toContain('e.target === e.currentTarget');
  });
});
