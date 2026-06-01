import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PICKERS = [
  'src/components/CompareVnPicker.tsx',
  'src/components/VnSeedPicker.tsx',
  'src/components/SimilarSeedPicker.tsx',
];

describe('picker response hardening', () => {
  it('decodes local and VNDB responses before rendering rows', () => {
    for (const path of PICKERS) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('decodeCollectionFindMatches');
      expect(source).toContain('decodeVndbSearchResults');
    }
  });

  it('aborts replaced and unmounted searches', () => {
    for (const path of PICKERS) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('searchAbortRef.current?.abort()');
      expect(source).toContain('signal: ac.signal');
      expect(source).toContain('ac.signal.aborted');
    }
  });
});
