import { readApiError } from './api-error-read';
import { decodeCollectionPage } from './collection-client-shape';
export type { CollectionPage } from './collection-client-shape';

const FULL_COLLECTION_PAGE_SIZE = 500;
const MAX_COLLECTION_PAGES = 20_000;

/**
 * Read every collection page through bounded API responses.
 *
 * @param params Base collection query parameters without page state.
 * @param decodeItem Caller-specific row decoder.
 * @param init Optional fetch settings such as an abort signal.
 * @param fallbackError Error text when the server response is not structured JSON.
 * @returns Items from every returned page in API order.
 */
export async function fetchAllCollectionItems<T>(
  params: URLSearchParams,
  decodeItem: (value: unknown) => T | null,
  init: RequestInit = {},
  fallbackError = 'collection request failed',
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= MAX_COLLECTION_PAGES; page += 1) {
    const pageParams = new URLSearchParams(params);
    pageParams.set('page', String(page));
    pageParams.set('limit', String(FULL_COLLECTION_PAGE_SIZE));
    const response = await fetch(`/api/collection?${pageParams.toString()}`, {
      ...init,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(await readApiError(response, fallbackError));
    const body = decodeCollectionPage(await response.json(), decodeItem);
    if (!body || body.pagination.page !== page) throw new Error(fallbackError);
    items.push(...body.items);
    if (!body.pagination.has_more) return items;
  }
  throw new Error('collection pagination exceeded its safety bound');
}
