import { describe, expect, it } from 'vitest';
import { dictionaries } from '@/lib/i18n/dictionaries';

/**
 * Pin the empty-state copy for the `/activity` log in every locale.
 *
 * The page renders `t.userActivity.empty` when no rows are persisted.
 * Without this guard, a future locale rename could silently break the
 * empty-state surface in one language while passing typecheck.
 */
describe('/activity empty-state i18n', () => {
  it('exposes a non-empty userActivity.empty string in FR / EN / JA', () => {
    for (const locale of ['fr', 'en', 'ja'] as const) {
      const dict = (dictionaries as Record<string, { userActivity: { empty: string; title: string; subtitle: string } }>)[locale];
      expect(dict.userActivity.empty.trim().length).toBeGreaterThan(0);
      expect(dict.userActivity.title.trim().length).toBeGreaterThan(0);
      expect(dict.userActivity.subtitle.trim().length).toBeGreaterThan(0);
    }
  });
});
