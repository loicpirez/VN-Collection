import 'server-only';
import { getCompareRepository } from './db/repositories/compare';

export type {
  SharedVa,
  SharedVaCharacterCredit,
  SharedVaVnCredit,
} from './db/repositories/compare';

/**
 * Finds voice actors credited on every compared VN.
 *
 * @param vnIds VN ids from the compare page.
 * @returns Shared voice actors grouped by VN, preserving input VN order.
 */
export async function findSharedVasForVns(vnIds: string[]): Promise<import('./db/repositories/compare').SharedVa[]> {
  return getCompareRepository().findSharedVas(vnIds);
}
