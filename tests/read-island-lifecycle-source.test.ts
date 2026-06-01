import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MAP = readFileSync('src/components/MapPageClient.tsx', 'utf8');
const EGS = readFileSync('src/components/EgsRichDetails.tsx', 'utf8');
const QUOTES = readFileSync('src/components/QuotesSection.tsx', 'utf8');
const PLACE_STOCK = readFileSync('src/components/PlaceVnBrowser.tsx', 'utf8');
const COVER = readFileSync('src/components/CoverSourcePicker.tsx', 'utf8');

describe('reusable read-island lifecycle', () => {
  it('applies map geocoding results only from the current controller', () => {
    expect(MAP).toContain('controller.signal.aborted || searchControllerRef.current !== controller');
    expect(MAP).toContain('!controller.signal.aborted && searchControllerRef.current === controller');
    expect(MAP).toContain('setActivePlaceId(focusId ?? null)');
    expect(MAP).toContain('setSearchTarget(null)');
  });

  it('reseeds EGS rich details while a replacement VN loads', () => {
    expect(EGS).toContain('setRaw(null)');
    expect(EGS).toContain('setLoading(true)');
    expect(EGS).toContain('<Users className="h-3 w-3" aria-hidden />');
    expect(EGS).not.toContain(' · ');
    expect(EGS).not.toContain(' – ');
  });

  it('reloads quotes for every VN identity and uses ASCII presentation tokens', () => {
    expect(QUOTES).toContain('setQuotes(null)');
    expect(QUOTES).not.toContain('if (quotes !== null) return');
    expect(QUOTES).toContain("}, [vnId, t.common.error]);");
    expect(QUOTES).not.toContain(' · ');
    expect(QUOTES).not.toContain('—');
    expect(QUOTES).not.toContain('“');
    expect(QUOTES).not.toContain('”');
  });

  it('does not apply decoded place-stock or cover-candidate state after abort', () => {
    expect(PLACE_STOCK).toContain('if (signal?.aborted) return');
    expect(COVER).toContain('if (!ctrl.signal.aborted) setCandidates(candidates)');
    expect(COVER).toContain("if (e.name === 'AbortError' || ctrl.signal.aborted) return");
    expect(COVER).toContain('<Sparkles className="h-4 w-4" aria-hidden />');
  });
});
