/**
 * Regression test for the operator-flagged bug:
 *   "you matched NOT by original title airebo idol revolution
 *    so shit match wrong totally"
 *
 * Counter-example pinned in commit: a VN has ErogameScape
 * `egs_game.egs_id = N`, but eroge-price game id N is a
 * completely unrelated title. Eroge-price.com
 * uses its own id namespace; ErogameScape ids are NOT a 1:1 mapping.
 *
 * Contract: `refreshErogePrice` MUST go through the title search
 * (`searchAndFetchAll(alttitle ?? title)`) regardless of any
 * `egs_id` available locally. The only way an `epId` ever ends up
 * in `fetchErogePriceBundle` is via the operator's manual PATCH /
 * POST endpoints.
 *
 * Strategy: read the stock.ts source and assert the buggy pattern
 * is gone. A behaviour test would need to fake the eroge-price
 * upstream which is out of scope here — the source-level contract
 * is the right granularity.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const STOCK_SRC = readFileSync(
  join(__dirname, '..', 'src', 'lib', 'stock.ts'),
  'utf8',
);

describe('refreshErogePrice must not use egs_id as eroge-price id', () => {
  it('does not call fetchErogePriceBundle from the refresh path', () => {
    // `fetchErogePriceBundle` is fine — but it must not be reachable
    // from `refreshErogePrice`. Locate the function body and assert
    // it contains no direct fetch call.
    const start = STOCK_SRC.indexOf('async function refreshErogePrice');
    expect(start).toBeGreaterThan(-1);
    // Walk braces to find the matching close.
    let depth = 0;
    let i = STOCK_SRC.indexOf('{', start);
    let end = -1;
    while (i < STOCK_SRC.length) {
      const ch = STOCK_SRC[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
      i++;
    }
    expect(end).toBeGreaterThan(start);
    const body = STOCK_SRC.slice(start, end);
    expect(body).not.toMatch(/fetchErogePriceBundle\s*\(/);
  });

  it('uses buildErogePriceQueries(vn.alttitle, vn.title) for the search query', () => {
    const start = STOCK_SRC.indexOf('async function refreshErogePrice');
    let depth = 0;
    let i = STOCK_SRC.indexOf('{', start);
    let end = -1;
    while (i < STOCK_SRC.length) {
      const ch = STOCK_SRC[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
      i++;
    }
    const body = STOCK_SRC.slice(start, end);
    expect(body).toMatch(/searchAndFetchAll\s*\(/);
    expect(body).toMatch(/buildErogePriceQueries\s*\(\s*vn\.alttitle\s*,\s*vn\.title/);
  });
});
