/** Source fields included in local textual search. */
export type TextSearchSource = 'notes' | 'custom_description' | 'quote';

/** One local textual-search result returned to the search UI. */
export interface TextSearchHit {
  vn_id: string;
  title: string;
  source: TextSearchSource;
  snippet: string;
}

/**
 * Build the compact preview used by local textual search results.
 *
 * @param text Source text containing or near the query.
 * @param query User-entered search term.
 * @returns A bounded snippet, with ellipses when the match is not at an edge.
 */
export function buildTextSearchSnippet(text: string, query: string): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text.slice(0, 160);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}
