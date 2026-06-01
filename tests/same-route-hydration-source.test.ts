import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');

describe('same-route client-island hydration', () => {
  it('rehydrates EGS and Eroge Price panels when the VN identity changes', () => {
    const egs = source('src/components/EgsPanel.tsx');
    const erogePrice = source('src/components/ErogePricePanel.tsx');

    expect(egs).toContain('identityRef.current = vnId');
    expect(egs).toContain('setFetchState({');
    expect(egs).toContain('setPickerOpen(false)');
    expect(egs).toContain('}, [load, vnId, initialGame, initialSource])');

    expect(erogePrice).toContain('identityRef.current = vnId');
    expect(erogePrice).toContain('setExtras(initialExtras)');
    expect(erogePrice).toContain('setActiveId(initialExtras.selectedEpId ?? initialExtras.candidates[0]?.epId ?? 0)');
    expect(erogePrice).toContain('setVnMatches(new Map())');
    expect(erogePrice).toContain('<CandidateCard key={active.epId}');
  });

  it('resets VN detail drafts and optimistic state on identity changes', () => {
    const favorite = source('src/components/FavoriteToggleButton.tsx');
    const vndb = source('src/components/VndbStatusPanel.tsx');
    const synopsis = source('src/components/CustomSynopsis.tsx');
    const activity = source('src/components/ActivityTimeline.tsx');
    const gameLog = source('src/components/GameLog.tsx');

    expect(favorite).toContain('setOn(initial)');
    expect(favorite).toContain('}, [vnId, initial])');
    expect(vndb).toContain('setPendingLabel(null)');
    expect(vndb).toContain('setPendingClear(false)');
    expect(vndb).toContain('}, [vnId])');
    expect(synopsis).toContain("setText(initial ?? '')");
    expect(synopsis).toContain('setShowSources(false)');
    expect(activity).toContain('setText(\'\')');
    expect(activity).toContain('}, [vnId, initial])');
    expect(gameLog).toContain('setEditingId(null)');
    expect(gameLog).toContain('setSavingEdit(false)');
    expect(gameLog).toContain('}, [vnId, initial])');
  });

  it('rehydrates release ownership and rejects stale mutation completion work', () => {
    const releaseOwned = source('src/components/ReleaseOwnedToggle.tsx');
    const detailSources = [
      'src/components/FavoriteToggleButton.tsx',
      'src/components/VndbStatusPanel.tsx',
      'src/components/CustomSynopsis.tsx',
      'src/components/ActivityTimeline.tsx',
      'src/components/GameLog.tsx',
      'src/components/ReleaseOwnedToggle.tsx',
      'src/components/ErogePricePanel.tsx',
    ].map(source);

    expect(releaseOwned).toContain('setInCollection(initialInCollection)');
    expect(releaseOwned).toContain('setOwned(initialOwned)');
    expect(releaseOwned).toContain('}, [identity, initialInCollection, initialOwned])');
    for (const body of detailSources) {
      expect(body).toContain('identityRef.current');
    }
  });
});
