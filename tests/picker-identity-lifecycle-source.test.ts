import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const COMPARE = readFileSync('src/components/CompareWithButton.tsx', 'utf8');
const RECOMMEND = readFileSync('src/components/VnSeedPicker.tsx', 'utf8');
const SIMILAR = readFileSync('src/components/SimilarSeedPicker.tsx', 'utf8');

describe('picker identity lifecycle', () => {
  it('clears compare-with state when the owning VN changes', () => {
    expect(COMPARE).toContain('setRows([])');
    expect(COMPARE).toContain('setPicked(new Set())');
    expect(COMPARE).toContain("setFilter('')");
    expect(COMPARE).toContain('}, [currentVnId]);');
  });

  it('clears recommendation seed search state when the URL seed changes', () => {
    expect(RECOMMEND).toContain('searchAbortRef.current?.abort()');
    expect(RECOMMEND).toContain("lastQueryRef.current = ''");
    expect(RECOMMEND).toContain('setSearchingLocal(false)');
    expect(RECOMMEND).toContain('setSearchingVndb(false)');
    expect(RECOMMEND).toContain('setEditing(!initialSeed)');
    expect(RECOMMEND).toContain('}, [seedId, initialSeed?.id]);');
    expect(RECOMMEND).not.toContain("join(' · ')");
  });

  it('clears similar seed search state when the URL seed changes', () => {
    expect(SIMILAR).toContain('const seedId = currentSeed?.id ?? null');
    expect(SIMILAR).toContain('searchAbortRef.current?.abort()');
    expect(SIMILAR).toContain("lastQueryRef.current = ''");
    expect(SIMILAR).toContain('setSearching(false)');
    expect(SIMILAR).toContain('setEditing(!currentSeed)');
    expect(SIMILAR).toContain('}, [seedId]);');
    expect(SIMILAR).not.toContain("join(' · ')");
  });
});
