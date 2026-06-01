export interface CollectionPage {
  page: number;
  page_size: number;
  returned: number;
  has_more: boolean;
}

interface CollectionPageResponse<T> {
  items?: T[];
  pagination?: CollectionPage;
}

const FULL_COLLECTION_PAGE_SIZE = 500;
const MAX_COLLECTION_PAGES = 20_000;

/**
 * Read every collection page through bounded API responses.
 *
 * @param params Base collection query parameters without page state.
 * @param init Optional fetch settings such as an abort signal.
 * @returns Items from every returned page in API order.
 */
export async function fetchAllCollectionItems<T>(
  params: URLSearchParams,
  init: RequestInit = {},
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
    if (!response.ok) throw new Error(await response.text());
    const body = (await response.json()) as CollectionPageResponse<T>;
    items.push(...(body.items ?? []));
    if (!body.pagination?.has_more) return items;
  }
  throw new Error('collection pagination exceeded its safety bound');
}
