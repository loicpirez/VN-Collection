/**
 * Pin the parity between the VNDB and EGS top-ranked card layouts.
 *
 * Both tabs render the same primary chip row (rating / votes / year)
 * with the same affordance shape; EGS adds the Bayesian shrunken
 * score as a clearly-labelled secondary chip below the primary row.
 *
 * The test asserts the primary chip count is identical for both tab
 * shapes so a future refactor that drops a chip from one side only
 * fails loudly instead of silently degrading the parity.
 *
 * Mirrors the chip selection logic that lives inline in
 * `src/app/top-ranked/page.tsx`; if either is changed, both must
 * move together.
 */
import { describe, expect, it } from 'vitest';
import { primaryChips, secondaryChips } from '@/lib/top-ranked-layout';

describe('top-ranked layout parity', () => {
  it('VNDB and EGS rows render the same primary chip count', () => {
    const vndb = primaryChips({
      kind: 'vndb',
      rating: 87,
      votecount: 1200,
      yearDigits: '2018',
    });
    const egs = primaryChips({
      kind: 'egs',
      rating: 82,
      votecount: 350,
      yearDigits: '2018',
    });
    expect(vndb.length).toBe(3);
    expect(egs.length).toBe(3);
    expect(vndb.length).toBe(egs.length);
  });

  it('null values drop their chip on both sides', () => {
    const vndb = primaryChips({
      kind: 'vndb',
      rating: null,
      votecount: null,
      yearDigits: null,
    });
    const egs = primaryChips({
      kind: 'egs',
      rating: null,
      votecount: null,
      yearDigits: null,
    });
    expect(vndb.length).toBe(0);
    expect(egs.length).toBe(0);
  });

  it('EGS secondary chip surfaces the Bayesian-shrunken score as a labelled extra', () => {
    const sec = secondaryChips({ kind: 'egs', rating: 100, count: 3 });
    expect(sec.length).toBe(1);
    expect(sec[0]?.kind).toBe('bayes');
  });

  it('VNDB has no secondary chip — Bayesian extras are EGS-only', () => {
    const sec = secondaryChips({ kind: 'vndb', rating: 90, count: 4000 });
    expect(sec).toEqual([]);
  });
});
