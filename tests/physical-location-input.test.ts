/**
 * TESTA-020 — parsePhysicalLocations reject-not-truncate contract.
 *
 * The HTTP-facing parser rejects (rather than silently truncating)
 * inputs that exceed the 32-entry / 200-char caps, accepts both a
 * comma-delimited string and a string array, rejects arrays carrying
 * a non-string entry, and de-duplicates the trimmed result.
 */
import { describe, expect, it } from 'vitest';
import { parsePhysicalLocations } from '@/lib/physical-location-input';

describe('parsePhysicalLocations', () => {
  it('treats null and undefined as an empty selection', () => {
    expect(parsePhysicalLocations(null)).toEqual({ ok: true, value: [] });
    expect(parsePhysicalLocations(undefined)).toEqual({ ok: true, value: [] });
  });

  it('splits a comma-delimited string and trims each entry', () => {
    expect(parsePhysicalLocations(' Salon shelf , Box 3 ')).toEqual({
      ok: true,
      value: ['Salon shelf', 'Box 3'],
    });
  });

  it('accepts a string array', () => {
    expect(parsePhysicalLocations(['Salon shelf', 'Box 3'])).toEqual({
      ok: true,
      value: ['Salon shelf', 'Box 3'],
    });
  });

  it('de-duplicates the trimmed result', () => {
    expect(parsePhysicalLocations(['Box 3', ' Box 3 ', 'Box 3'])).toEqual({
      ok: true,
      value: ['Box 3'],
    });
  });

  it('accepts exactly 32 entries', () => {
    const entries = Array.from({ length: 32 }, (_, i) => `Box ${i}`);
    const result = parsePhysicalLocations(entries);
    expect(result.ok).toBe(true);
    expect(result).toEqual({ ok: true, value: entries });
  });

  it('rejects 33 entries without truncating', () => {
    const entries = Array.from({ length: 33 }, (_, i) => `Box ${i}`);
    expect(parsePhysicalLocations(entries)).toEqual({
      ok: false,
      error: 'physical_location accepts at most 32 entries',
    });
  });

  it('accepts an entry of exactly 200 characters', () => {
    const entry = 'x'.repeat(200);
    expect(parsePhysicalLocations([entry])).toEqual({ ok: true, value: [entry] });
  });

  it('rejects an entry of 201 characters without truncating', () => {
    const entry = 'x'.repeat(201);
    expect(parsePhysicalLocations([entry])).toEqual({
      ok: false,
      error: 'physical_location entries must be at most 200 characters',
    });
  });

  it('rejects an array containing a non-string entry', () => {
    expect(parsePhysicalLocations(['Box 3', 42])).toEqual({
      ok: false,
      error: 'physical_location entries must be strings',
    });
  });

  it('rejects a value that is neither array nor string', () => {
    expect(parsePhysicalLocations({ shelf: 'A' })).toEqual({
      ok: false,
      error: 'physical_location must be array or string',
    });
    expect(parsePhysicalLocations(42)).toEqual({
      ok: false,
      error: 'physical_location must be array or string',
    });
  });
});
