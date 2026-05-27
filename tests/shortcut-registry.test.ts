/**
 * Pins the global keyboard-shortcut registry. Every "g <key>"
 * navigation shortcut wired into `useGlobalKeyboardShortcuts` falls
 * back to this table for its destination route; a drift here
 * silently breaks navigation parity between the keyboard handler
 * and the help-panel display.
 *
 * Coverage:
 *   1. `routeForShortcutKey` round-trips every static + dynamic
 *      route, lowercases the input, and rejects unknown keys.
 *   2. `routeShortcutRows` returns one row per registered shortcut
 *      with the `g <key>` prefix and a non-empty label.
 *   3. `globalShortcutRows` exposes the three non-navigation keys
 *      (`/`, `?`, `Esc`) in the expected order.
 *   4. `pageShortcutSections` returns the three documented sections
 *      (VN page, library, tags) with non-empty rows.
 */
import { describe, expect, it } from 'vitest';
import {
  ROUTE_SHORTCUTS,
  routeForShortcutKey,
  routeShortcutRows,
  globalShortcutRows,
  pageShortcutSections,
} from '@/lib/shortcut-registry';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { dictionaries } from '@/lib/i18n/dictionaries';

const t: Dictionary = dictionaries.en;
const YEAR = 2026;

describe('shortcut-registry — ROUTE_SHORTCUTS', () => {
  it('declares one entry per documented destination', () => {
    // Every key in the registry must be a single lowercase letter
    // so the keyboard handler can build the chord cleanly.
    for (const row of ROUTE_SHORTCUTS) {
      expect(row.key).toMatch(/^[a-z]$/);
    }
  });

  it('no key is duplicated across the registry', () => {
    const seen = new Set<string>();
    for (const row of ROUTE_SHORTCUTS) {
      expect(seen.has(row.key)).toBe(false);
      seen.add(row.key);
    }
  });
});

describe('shortcut-registry — routeForShortcutKey', () => {
  it('returns the static href for a static-route key', () => {
    expect(routeForShortcutKey('h', YEAR)).toBe('/');
    expect(routeForShortcutKey('s', YEAR)).toBe('/search');
    expect(routeForShortcutKey('w', YEAR)).toBe('/wishlist');
    expect(routeForShortcutKey('l', YEAR)).toBe('/lists');
  });

  it('substitutes the current year into the dynamic /year href', () => {
    expect(routeForShortcutKey('y', YEAR)).toBe(`/year?y=${YEAR}`);
    expect(routeForShortcutKey('y', 2020)).toBe('/year?y=2020');
  });

  it('lowercases the input before lookup', () => {
    expect(routeForShortcutKey('H', YEAR)).toBe('/');
    expect(routeForShortcutKey('Y', YEAR)).toBe(`/year?y=${YEAR}`);
  });

  it('returns null for unknown keys', () => {
    expect(routeForShortcutKey('z', YEAR)).toBe(null);
    expect(routeForShortcutKey('', YEAR)).toBe(null);
    expect(routeForShortcutKey('zz', YEAR)).toBe(null);
  });
});

describe('shortcut-registry — routeShortcutRows', () => {
  it('returns one row per registered shortcut', () => {
    const rows = routeShortcutRows(t, YEAR);
    expect(rows.length).toBe(ROUTE_SHORTCUTS.length);
  });

  it('every row carries the `g <key>` chord prefix', () => {
    const rows = routeShortcutRows(t, YEAR);
    for (const row of rows) {
      expect(row.key).toMatch(/^g [a-z]$/);
    }
  });

  it('every row resolves to a non-empty label string', () => {
    const rows = routeShortcutRows(t, YEAR);
    for (const row of rows) {
      expect(typeof row.label).toBe('string');
      expect(row.label.length).toBeGreaterThan(0);
    }
  });
});

describe('shortcut-registry — globalShortcutRows', () => {
  it('returns the canonical three non-navigation chords', () => {
    const rows = globalShortcutRows(t);
    const keys = rows.map((r) => r.key);
    expect(keys).toEqual(['/', '?', 'Esc']);
  });

  it('every row has a non-empty label', () => {
    for (const row of globalShortcutRows(t)) {
      expect(row.label.length).toBeGreaterThan(0);
    }
  });
});

describe('shortcut-registry — pageShortcutSections', () => {
  it('returns the three documented sections', () => {
    const sections = pageShortcutSections(t);
    expect(sections.length).toBe(3);
    expect(sections[0].label).toBe(t.shortcuts.vnPage);
    expect(sections[1].label).toBe(t.shortcuts.libPage);
    expect(sections[2].label).toBe(t.shortcuts.tagsPage);
  });

  it('every section has at least one row, every row has key + label', () => {
    for (const section of pageShortcutSections(t)) {
      expect(section.rows.length).toBeGreaterThan(0);
      for (const row of section.rows) {
        expect(row.key.length).toBeGreaterThan(0);
        expect(row.label.length).toBeGreaterThan(0);
      }
    }
  });
});
