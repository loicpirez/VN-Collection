/**
 * Pins the empty-state contract of `/recommendations?mode=similar-to-vn`.
 *
 * Two assertions:
 *   1. The empty-state shell (`<SimilarSeedEmptyState>`) renders an
 *      in-page picker with the search input wired up to the
 *      `seedPicker.label` / `ariaLabel` i18n keys.
 *   2. None of the user-visible copy on that empty-state branch tells
 *      the operator to "edit `?seed=` in the URL" — Blocker 14
 *      specifically calls out that affordance as unacceptable.
 *
 * The page-level decision helper (`pickSimilarToVnView`) is also
 * exercised so the routing logic that selects between
 * `empty / invalid / results` stays pinned.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

// Mock next/navigation before importing any component that pulls it
// in. `renderToStaticMarkup` never fires effects, so we only need the
// hook return value to be a plausible no-op.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/recommendations',
}));

// Mock the i18n client so the picker sees the FR dictionary. We pull
// it straight from the canonical dictionaries module so any future
// rename of `seedPicker.*` ripples through.
import { dictionaries } from '@/lib/i18n/dictionaries';
vi.mock('@/lib/i18n/client', async () => {
  return {
    useT: () => dictionaries.fr,
    useLocale: () => 'fr' as const,
    I18nProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

// Mock the display-settings provider used by SafeImage — we don't
// need the real NSFW gating logic here, just a no-op so the picker
// renders.
vi.mock('@/lib/settings/client', async () => ({
  useDisplaySettings: () => ({ settings: { preferLocal: false, hideImages: false, blurR18: false, nsfwThreshold: 1, density: {} } }),
  isExplicit: () => false,
}));

import { SimilarSeedEmptyState } from '@/components/SimilarSeedEmptyState';
import { pickSimilarToVnView } from '@/lib/recommend-similar-view';

describe('pickSimilarToVnView', () => {
  it('returns `empty` when no seed id is set', () => {
    expect(pickSimilarToVnView({ seedVnId: undefined, seedRowExists: false })).toBe('empty');
  });
  it('returns `invalid` when seed id is set but no local row matches', () => {
    expect(pickSimilarToVnView({ seedVnId: 'v17', seedRowExists: false })).toBe('invalid');
  });
  it('returns `results` when seed id is set and resolves locally', () => {
    expect(pickSimilarToVnView({ seedVnId: 'v17', seedRowExists: true })).toBe('results');
  });
});

describe('similar-to-vn empty state renders the in-page picker', () => {
  it('renders the seed-picker search input with the i18n label', () => {
    const html = renderToStaticMarkup(
      React.createElement(SimilarSeedEmptyState, {
        invalid: false,
        chip: null,
        fallbackSeedId: undefined,
        t: dictionaries.fr,
      }),
    );
    // Search input is present, labelled, and tagged with the picker testid.
    expect(html).toContain('data-testid="vn-seed-picker"');
    expect(html).toContain('aria-label="Recherche du VN de référence"');
    expect(html).toContain(dictionaries.fr.recommend.seedPicker.label);
    expect(html).toContain(dictionaries.fr.recommend.seedPicker.placeholder);
    // The empty-state copy is the new, picker-first headline + body.
    // React's `renderToStaticMarkup` HTML-encodes apostrophes as
    // `&#x27;` so we compare against the decoded form to avoid a
    // brittle string match.
    const decoded = html.replace(/&#x27;/g, "'");
    expect(decoded).toContain(dictionaries.fr.recommend.modes.similarToVn.emptyHeadline);
    expect(decoded).toContain(dictionaries.fr.recommend.modes.similarToVn.emptyBody);
  });

  it('does NOT instruct the operator to edit the URL', () => {
    const html = renderToStaticMarkup(
      React.createElement(SimilarSeedEmptyState, {
        invalid: false,
        chip: null,
        fallbackSeedId: undefined,
        t: dictionaries.fr,
      }),
    );
    // The previous behaviour leaked "paramètre `?seed=`" / "URL `?seed=`"
    // / "`?seed=v123`" into the empty-state copy. Hard-pin against any
    // string that survives a future regression.
    expect(html).not.toMatch(/paramètre\s+`?\?seed=/i);
    expect(html).not.toMatch(/URL\s+`?\?seed=/i);
    expect(html).not.toMatch(/\?seed=v\d+/);
    expect(html).not.toMatch(/edit the URL/i);
  });

  it('renders an error-toned chip + picker when the seed id is invalid', () => {
    const html = renderToStaticMarkup(
      React.createElement(SimilarSeedEmptyState, {
        invalid: true,
        chip: null,
        fallbackSeedId: 'v999999',
        t: dictionaries.fr,
      }),
    );
    // Chip carries the synthesised id, plus the picker stays mounted
    // so the operator can immediately replace the broken seed.
    expect(html).toContain('data-testid="vn-seed-chip"');
    expect(html).toContain('data-seed-id="v999999"');
    expect(html).toContain(dictionaries.fr.recommend.seedPicker.invalidSeed);
    expect(html).toContain('data-testid="vn-seed-picker"');
  });

  it('renders the Change + Clear buttons anchored to a chip for a valid seed', () => {
    // Simulates the `?seed=v17` URL state — the picker page hands a
    // resolved chip into the empty-state shell when the seed exists
    // in the local DB. The shell forwards it to the picker, which
    // renders the chip with Change + Clear affordances.
    const html = renderToStaticMarkup(
      React.createElement(SimilarSeedEmptyState, {
        invalid: false,
        chip: {
          id: 'v17',
          title: 'placeholder-vn-title',
          alttitle: null,
          released: '2018-01-01',
          developer: 'Studio X',
          image: null,
        },
        fallbackSeedId: undefined,
        t: dictionaries.fr,
      }),
    );
    expect(html).toContain('data-testid="vn-seed-chip"');
    expect(html).toContain('data-seed-id="v17"');
    expect(html).toContain('data-testid="vn-seed-change"');
    expect(html).toContain('data-testid="vn-seed-clear"');
    expect(html).toContain(dictionaries.fr.recommend.seedPicker.change);
    expect(html).toContain(dictionaries.fr.recommend.seedPicker.clear);
  });
});

describe('dictionaries — similar-to-vn copy', () => {
  it('every locale dropped the legacy URL-edit instruction', () => {
    for (const locale of ['fr', 'en', 'ja'] as const) {
      const m = dictionaries[locale].recommend.modes.similarToVn;
      // Inspect every string field on the modes.similarToVn entry.
      // Type-relaxed because `Widen<>` makes the values plain strings.
      for (const [key, value] of Object.entries(m)) {
        if (typeof value !== 'string') continue;
        expect(value, `${locale}.modes.similarToVn.${key}`).not.toMatch(/\?seed=/);
        expect(value, `${locale}.modes.similarToVn.${key}`).not.toMatch(/edit the URL/i);
      }
    }
  });

  it('each locale exposes the seedPicker key block', () => {
    for (const locale of ['fr', 'en', 'ja'] as const) {
      const sp = dictionaries[locale].recommend.seedPicker;
      expect(sp.label).toBeTruthy();
      expect(sp.placeholder).toBeTruthy();
      expect(sp.searchingLocal).toBeTruthy();
      expect(sp.searchingVndb).toBeTruthy();
      expect(sp.noResults).toBeTruthy();
      expect(sp.change).toBeTruthy();
      expect(sp.clear).toBeTruthy();
      expect(sp.currentSeed).toBeTruthy();
      expect(sp.ariaLabel).toBeTruthy();
    }
  });
});
