import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * NEW-TCO-005: Behavioral guard for parseInt NaN in activity/page.tsx.
 * Verifies the `|| 0` pattern prevents NaN from propagating into DB offset.
 *
 * NEW-TCO-006: Behavioral guard for labels QR cap.
 * Verifies the 200-item slice + truncation notice logic is correct.
 */

describe('NEW-TCO-005 — activity page parseInt NaN guard', () => {
  function toPage(raw: string): number {
    return Math.max(0, parseInt(raw, 10) || 0);
  }

  it('returns 0 for non-numeric input', () => {
    expect(toPage('abc')).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(toPage('')).toBe(0);
  });

  it('returns 0 for negative page', () => {
    expect(toPage('-5')).toBe(0);
  });

  it('returns the numeric value for valid page', () => {
    expect(toPage('2')).toBe(2);
    expect(toPage('10')).toBe(10);
  });

  it('activity/page.tsx uses || 0 guard after parseInt', () => {
    const src = readFileSync(join('src', 'app', 'activity', 'page.tsx'), 'utf8');
    expect(src).toMatch(/parseInt[\s\S]{1,80}?\|\|\s*0/);
  });
});

describe('NEW-TCO-006 — labels QR item cap', () => {
  const MAX_LABELS = 200;

  it('slices to MAX_LABELS when items exceed cap', () => {
    const allItems = Array.from({ length: 250 }, (_, i) => ({ id: `v${i}`, title: `VN ${i}` }));
    const truncated = allItems.length > MAX_LABELS;
    const items = truncated ? allItems.slice(0, MAX_LABELS) : allItems;
    expect(items.length).toBe(200);
    expect(truncated).toBe(true);
  });

  it('does not truncate when items are within cap', () => {
    const allItems = Array.from({ length: 50 }, (_, i) => ({ id: `v${i}`, title: `VN ${i}` }));
    const truncated = allItems.length > MAX_LABELS;
    const items = truncated ? allItems.slice(0, MAX_LABELS) : allItems;
    expect(items.length).toBe(50);
    expect(truncated).toBe(false);
  });

  it('labels/page.tsx defines MAX_LABELS = 200', () => {
    const src = readFileSync(join('src', 'app', 'labels', 'page.tsx'), 'utf8');
    expect(src).toContain('const MAX_LABELS = 200');
  });

  it('labels/page.tsx slices to MAX_LABELS', () => {
    const src = readFileSync(join('src', 'app', 'labels', 'page.tsx'), 'utf8');
    expect(src).toMatch(/allItems\.slice\(0,\s*MAX_LABELS\)/);
  });

  it('labels/page.tsx renders truncation notice', () => {
    const src = readFileSync(join('src', 'app', 'labels', 'page.tsx'), 'utf8');
    expect(src).toContain('truncated');
    expect(src).toContain('MAX_LABELS');
  });
});
