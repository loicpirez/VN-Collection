// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadPrefs } from '@/components/PlaceBrowser';

describe('PlaceBrowser loadPrefs', () => {
  it('returns empty preferences without a browser window', () => {
    expect(loadPrefs()).toEqual({});
  });
});
