/**
 * Shared loading-state primitives. Centralises the "never flash an
 * empty state before the fetch resolves" contract that every async
 * section on the VN detail page and the listing pages obeys.
 *
 * Two concerns:
 *
 *   1. The `loading` flag — true while an in-flight fetch is running.
 *   2. The `hasLoadedOnce` flag — true once at least one fetch has
 *      completed (success or error). UIs key their empty-state copy
 *      off this rather than `!loading`, so a freshly-mounted section
 *      with `chars === null` never shows "no characters found"
 *      before the first response arrives.
 *
 * The component still owns its own state — these helpers just give
 * us a uniform vocabulary across the codebase.
 */

export interface LoadingState {
  loading: boolean;
  hasLoadedOnce: boolean;
}

export const INITIAL_LOADING_STATE: LoadingState = {
  loading: false,
  hasLoadedOnce: false,
};

/**
 * Project a `(loading, hasLoadedOnce, data)` triple onto a render
 * decision. UIs use this to decide between four mutually-exclusive
 * visual states:
 *
 *   - `'skeleton'`: render the loading placeholder. Either an
 *     in-flight fetch OR the initial pre-mount state.
 *   - `'empty'`: render the empty-state copy. Only after at least
 *     one fetch resolved AND the data is empty.
 *   - `'content'`: render the fetched data.
 *   - `'idle'`: neither — the section is closed / gated / pre-open.
 *
 * The "`!loading` only" shortcut common in older code accidentally
 * surfaces `'empty'` between mount and the first fetch's setLoading
 * call, which is the bug this helper exists to prevent.
 */
export function pickLoadingView<T>(
  state: LoadingState,
  data: T[] | null | undefined,
  opts?: { gated?: boolean },
): 'idle' | 'skeleton' | 'empty' | 'content' {
  if (opts?.gated) return 'idle';
  if (state.loading) return 'skeleton';
  if (!state.hasLoadedOnce) return 'skeleton';
  if (data == null) return 'skeleton';
  if (data.length === 0) return 'empty';
  return 'content';
}
