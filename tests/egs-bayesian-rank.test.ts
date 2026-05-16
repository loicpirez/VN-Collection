/**
 * Pin the Bayesian-shrinkage ranking math used by /top-ranked?tab=egs.
 *
 * Background: the previous EGS top-ranked ORDER BY was
 *   ORDER BY COALESCE(median, median2) DESC, count2 DESC
 * — a raw median ranking with vote count only as a tiebreaker. That
 * let a single-reviewer median=100 outrank a 2000-reviewer median=85.
 * Manual QA flagged this as a credibility bug.
 *
 * The new ORDER BY uses
 *   (count * median + C * priorMean) / (count + C)
 * which shrinks each row's median toward `priorMean` proportional to
 * its vote count. The tests below verify the math + the relative
 * ordering for several synthetic combinations.
 *
 * Synthetic fixtures only — no real VN titles.
 */
import { describe, expect, it } from 'vitest';
import {
  EGS_BAYES_PRIOR_MEAN,
  EGS_BAYES_PRIOR_STRENGTH,
  egsBayesianScore,
} from '@/lib/erogamescape';

describe('EGS Bayesian shrinkage math', () => {
  it('default constants are tuned to the documented values', () => {
    expect(EGS_BAYES_PRIOR_STRENGTH).toBe(30);
    expect(EGS_BAYES_PRIOR_MEAN).toBe(70);
  });

  it('zero votes collapses entirely to the prior mean', () => {
    expect(egsBayesianScore(95, 0)).toBeCloseTo(EGS_BAYES_PRIOR_MEAN, 6);
    expect(egsBayesianScore(10, 0)).toBeCloseTo(EGS_BAYES_PRIOR_MEAN, 6);
  });

  it('large vote count approaches the raw median', () => {
    // 10_000 votes against a prior strength of 30 ≈ leaves a tiny shrink.
    expect(egsBayesianScore(85, 10_000)).toBeCloseTo(85, 0);
    expect(egsBayesianScore(60, 10_000)).toBeCloseTo(60, 0);
  });

  it('low-vote outlier is shrunk below a moderate high-vote score', () => {
    // 5-vote median=100 vs 2000-vote median=85.
    // QA-flagged case: the raw ordering put the 5-vote row first; the
    // Bayesian ordering must reverse that.
    const outlier = egsBayesianScore(100, 5);
    const veteran = egsBayesianScore(85, 2000);
    expect(veteran).toBeGreaterThan(outlier);
    // Spot-check the numbers so a future tweak to constants makes the
    // test fail loudly:
    //   outlier = (5*100 + 30*70) / (5+30) = (500+2100)/35 ≈ 74.286
    //   veteran = (2000*85 + 30*70) / (2000+30) = (170000+2100)/2030 ≈ 84.78
    expect(outlier).toBeCloseTo(74.286, 2);
    expect(veteran).toBeCloseTo(84.78, 1);
  });

  it('parameters override defaults when supplied', () => {
    // C=0 means no shrinkage — score equals the raw median.
    expect(egsBayesianScore(95, 5, 0, 70)).toBeCloseTo(95, 6);
    // Different prior mean shifts the low-vote target.
    expect(egsBayesianScore(95, 0, 30, 50)).toBeCloseTo(50, 6);
  });

  it('produces a credible top-10 ordering for a mixed dataset', () => {
    // Each row is [rawMedian, count] — synthetic, no titles.
    const rows: Array<[number, number]> = [
      [100, 3], // outlier — should be near the bottom
      [95, 8], // mild outlier — middle
      [90, 50], // solid, sample size
      [85, 300], // strong, well-known
      [80, 1500], // very high vote count
      [88, 25], // upper-mid sample
      [75, 5000], // huge sample but lower raw
      [78, 800], // good sample, mid raw
      [65, 10], // low and low-vote — bottom
      [70, 200], // average across the board
    ];
    const sorted = rows
      .map(([m, c]) => ({ m, c, score: egsBayesianScore(m, c) }))
      .sort((a, b) => b.score - a.score);
    // The top 3 must NOT be dominated by low-vote outliers. The two
    // tail-low-vote rows (median=100 with count=3 and median=95 with
    // count=8) must sit BELOW the well-supported median=90,count=50
    // entry.
    const topThree = sorted.slice(0, 3).map((r) => `${r.m}/${r.c}`);
    expect(topThree).not.toContain('100/3');
    // 95/8 has Bayesian score = (8*95 + 30*70)/(8+30) = 76.84 — that
    // is below 90/50's 86.92 and 85/300's 84.95.
    const ninetyFiftyIdx = sorted.findIndex((r) => r.m === 90 && r.c === 50);
    const ninetyFiveEightIdx = sorted.findIndex((r) => r.m === 95 && r.c === 8);
    expect(ninetyFiftyIdx).toBeLessThan(ninetyFiveEightIdx);
  });
});
