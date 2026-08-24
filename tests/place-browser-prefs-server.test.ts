import { describe, expect, it } from 'vitest';
import { loadPrefs } from '@/components/PlaceBrowser';

describe('place browser server preferences', () => {
  it('does not access browser storage during server rendering', () => {
    expect(typeof window).toBe('undefined');
    expect(loadPrefs()).toEqual({});
  });
});
