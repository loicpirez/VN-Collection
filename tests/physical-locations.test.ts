import { describe, expect, it } from 'vitest';
import {
  normalizePhysicalLocations,
  parsePhysicalLocations,
  serializePhysicalLocations,
} from '@/lib/physical-locations';

describe('physical location persistence helpers', () => {
  it('normalizes text, drops invalid values, and enforces count and length bounds', () => {
    const long = 'x'.repeat(250);
    const values = [' Shelf ', '', 4, long, ...Array.from({ length: 40 }, (_, index) => `Place ${index}`)];
    const result = normalizePhysicalLocations(values);

    expect(result).toHaveLength(32);
    expect(result[0]).toBe('Shelf');
    expect(result[1]).toHaveLength(200);
    expect(result.at(-1)).toBe('Place 29');
  });

  it('parses canonical JSON, legacy CSV, empty values, and invalid JSON shapes', () => {
    expect(parsePhysicalLocations('["Shelf"," Box "]')).toEqual(['Shelf', 'Box']);
    expect(parsePhysicalLocations('Shelf, Box')).toEqual(['Shelf', 'Box']);
    expect(parsePhysicalLocations('{"place":"Shelf"}')).toEqual([]);
    expect(parsePhysicalLocations(null)).toEqual([]);
    expect(parsePhysicalLocations(undefined)).toEqual([]);
  });

  it('serializes arrays and legacy text while rejecting unsupported and empty values', () => {
    expect(serializePhysicalLocations([' Shelf ', 'Box'])).toBe('["Shelf","Box"]');
    expect(serializePhysicalLocations('Shelf, Box')).toBe('["Shelf","Box"]');
    expect(serializePhysicalLocations([])).toBeNull();
    expect(serializePhysicalLocations(4)).toBeNull();
    expect(serializePhysicalLocations(null)).toBeNull();
  });
});
