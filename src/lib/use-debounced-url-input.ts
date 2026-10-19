'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Keeps editable text independent from delayed acknowledgements of its URL commits.
 * @param urlValue Current committed URL value, including external navigation.
 * @param onCommit Callback that commits a trimmed query.
 * @param delay Debounce interval in milliseconds.
 * @returns The editable draft and its setter.
 */
export function useDebouncedUrlInput(urlValue: string, onCommit: (value: string) => void, delay: number) {
  const [draft, setDraft] = useState(urlValue);
  const issued = useRef(new Set<string>());
  const observed = useRef(urlValue);
  useEffect(() => {
    if (observed.current === urlValue) return;
    observed.current = urlValue;
    if (issued.current.delete(urlValue)) return;
    issued.current.clear();
    setDraft(urlValue);
  }, [urlValue]);
  useEffect(() => {
    const value = draft.trim();
    if (value === urlValue || issued.current.has(value)) return;
    const handle = setTimeout(() => {
      issued.current.add(value);
      onCommit(value);
    }, delay);
    return () => clearTimeout(handle);
  }, [draft, urlValue, onCommit, delay]);
  return [draft, setDraft] as const;
}

/**
 * Updates a client-owned search query without starting a server navigation.
 * @param pathname Listing route that owns the query.
 * @param search Current serialized filter parameters.
 * @param query Trimmed search text; empty text removes the query filter.
 * @returns Nothing; Next.js synchronizes its search-parameter subscribers.
 */
export function replaceSearchQueryInHistory(pathname: string, search: string, query: string): void {
  const params = new URLSearchParams(search);
  if (query) params.set('q', query);
  else params.delete('q');
  params.delete('page');
  const qs = params.toString();
  window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
}
