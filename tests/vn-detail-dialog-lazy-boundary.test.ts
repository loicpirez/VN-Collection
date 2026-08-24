import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const actions = readFileSync('src/components/VnDetailActionsBar.tsx', 'utf8');
const artworkOwner = readFileSync('src/components/LazyArtworkPickers.tsx', 'utf8');
const mappingOwner = readFileSync('src/components/LazyMapVnToEgsButton.tsx', 'utf8');

describe('VN detail advanced-dialog lazy boundary', () => {
  it('keeps rich dialog modules out of the server action-bar imports', () => {
    expect(actions).not.toContain("from './CoverSourcePicker'");
    expect(actions).not.toContain("from './BannerSourcePicker'");
    expect(actions).not.toContain("from './MapVnToEgsButton'");
    expect(actions).toContain("from './LazyArtworkPickers'");
    expect(actions).toContain("from './LazyMapVnToEgsButton'");
  });

  it('loads each advanced dialog through a client-only dynamic boundary', () => {
    expect(artworkOwner).toContain("import('./CoverSourcePicker')");
    expect(artworkOwner).toContain("import('./BannerSourcePicker')");
    expect(mappingOwner).toContain("import('./MapVnToEgsButton')");
    expect(artworkOwner.match(/ssr: false/g)).toHaveLength(2);
    expect(mappingOwner.match(/ssr: false/g)).toHaveLength(1);
  });
});
