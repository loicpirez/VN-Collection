import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('AliceNet Kobe branding', () => {
  const canonicalSurfaces = [
    'README.md',
    'FEATURES.md',
    'CLAUDE.md',
    'src/lib/alicesoft-kobe.ts',
    'src/lib/i18n/dictionaries.ts',
    'src/components/AliceNetKobeClient.tsx',
    'src/components/kobe/KobeLinkDialog.tsx',
    'src/app/alicesoft_kobe/loading.tsx',
    'src/app/api/alicesoft-kobe/[code]/link/route.ts',
  ];

  it('uses one user-facing label across canonical surfaces', () => {
    for (const path of canonicalSurfaces) {
      const text = source(path);
      expect(text, path).not.toContain('AliceSoft Kobe');
      expect(text, path).not.toContain('Alice Kobe');
      expect(text, path).not.toContain('AliceNET Kobe');
      expect(text, path).not.toContain('AliceNET神戸');
    }
  });

  it('documents stable compatibility identifiers', () => {
    for (const path of ['README.md', 'FEATURES.md', 'CLAUDE.md']) {
      const text = source(path);
      expect(text, path).toContain('AliceNet Kobe');
      expect(text, path).toContain('ALICESOFT_KOBE_ENABLED');
      expect(text, path).toContain('ALICE_KOBE_PROXY_*');
      expect(text, path).toContain('/alicesoft_kobe');
      expect(text, path).toContain('/api/alicesoft-kobe/*');
      expect(text, path).toContain('alicesoft_kobe_*');
    }
  });

  it('keeps the legacy proxy prefix mapped to the compatibility provider id', () => {
    const proxyConfig = source('src/lib/proxy-config.ts');
    expect(proxyConfig).toContain("alicesoft_kobe: 'ALICE_KOBE'");
    expect(proxyConfig).toContain("alicesoft_kobe: 'alicesoft_kobe_proxy_config'");
  });
});
