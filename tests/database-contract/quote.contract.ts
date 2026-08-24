import { describe, expect, it } from 'vitest';
import type { QuoteRepository } from '@/lib/db/repositories/quote';

/** Stable identifiers shared by the quote parity contract. */
export const QUOTE_CONTRACT_IDS = {
  firstVn: 'v994301',
  outsideCollectionVn: 'v994302',
  firstQuote: 'q994301',
  secondQuote: 'q994302',
} as const;

/** Harness that supplies a freshly seeded quote repository. */
export interface QuoteContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: QuoteRepository) => Promise<void>): Promise<void>;
}

/** Register local quote feed, search, pagination, and random parity tests. */
export function registerQuoteRepositoryContract(
  label: string,
  harness: QuoteContractHarness,
): void {
  describe(`${label} quote repository contract`, () => {
    it('lists only collection quotes with cover and portrait fallbacks', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.list()).resolves.toEqual([
          expect.objectContaining({
            quote_id: QUOTE_CONTRACT_IDS.firstQuote,
            vn_id: QUOTE_CONTRACT_IDS.firstVn,
            character_local_image: 'characters/c994301.jpg',
            vn_image_url: 'https://example.test/v994301.jpg',
            vn_local_image_thumb: 'covers/v994301-thumb.jpg',
          }),
        ]);
      });
    });

    it('escapes literal wildcard characters and applies bounded pagination', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.list('100%_real', 1, 0)).resolves.toMatchObject([
          { quote_id: QUOTE_CONTRACT_IDS.firstQuote },
        ]);
        await expect(repository.list('not present', Number.POSITIVE_INFINITY, -5)).resolves.toEqual([]);
      });
    });

    it('returns one locally mirrored collection quote', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.randomLocal()).resolves.toMatchObject({
          quote_id: QUOTE_CONTRACT_IDS.firstQuote,
          vn_id: QUOTE_CONTRACT_IDS.firstVn,
        });
      });
    });

    it('atomically replaces one VN quote mirror', async () => {
      await harness.withRepository(async (repository) => {
        await repository.replaceForVn(QUOTE_CONTRACT_IDS.firstVn, [{
          id: 'q994399',
          quote: 'Replacement quote',
          score: 7,
          character: { id: 'c994399', name: 'Replacement Character' },
        }]);
        await expect(repository.list()).resolves.toMatchObject([{
          quote_id: 'q994399',
          quote: 'Replacement quote',
          character_id: 'c994399',
        }]);
        await repository.replaceForVn(QUOTE_CONTRACT_IDS.firstVn, []);
        await expect(repository.list()).resolves.toEqual([]);
      });
    });
  });
}
