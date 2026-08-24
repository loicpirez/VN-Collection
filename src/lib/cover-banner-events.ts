/**
 * Shared CustomEvent names + typed details for cover / banner mutation
 * notifications. Components that render the active cover or banner
 * (HeroBanner, CoverEditOverlay, VnCard, OwnedEditionsSection tile,
 * MediaGallery tile…) subscribe to these so a user action in one
 * surface flips every other rendered surface for the same VN
 * without a manual page refresh.
 *
 * Producers:
 *   - MediaGallery's per-tile "Set as cover" / "Set as banner".
 *   - CoverSourcePicker / BannerSourcePicker tab actions.
 *   - The rotation PATCH paths (cover / banner) — same event with
 *     the new rotation value in the detail.
 *
 * Consumers re-render with the updated src + rotation immediately
 * (optimistic UI). A subsequent `router.refresh()` is dispatched as
 * a defensive fallback so server-rendered surfaces also re-derive.
 *
 * Why a global custom event rather than a Context provider: the
 * components that need to react are scattered across server- and
 * client-rendered subtrees that don't share a parent (the VN card on
 * a list page lives outside the VN detail page's tree). A window-
 * scoped event reaches every mounted listener without a top-level
 * provider rewrite.
 */

export const VN_COVER_CHANGED_EVENT = 'vn:cover-changed';
export const VN_BANNER_CHANGED_EVENT = 'vn:banner-changed';
export const VN_COVER_ACTION_EVENT = 'vn:cover-action';
export const VN_BANNER_EDIT_EVENT = 'vn:edit-banner';

export type VnCoverAction = 'rotate-left' | 'rotate-right' | 'reset-rotation';

export interface VnCoverActionDetail {
  vnId: string;
  action: VnCoverAction;
}

export interface VnBannerEditDetail {
  vnId: string;
}

export interface VnCoverChangedDetail {
  vnId: string;
  /** Resolved remote URL or null when reverted to default. */
  newSrc: string | null;
  /** Local storage path (relative under data/storage), null when remote-only. */
  newLocal: string | null;
  /** Updated rotation, when the event was triggered by a rotation change. */
  rotation?: 0 | 90 | 180 | 270;
}

export interface VnBannerChangedDetail {
  vnId: string;
  newSrc: string | null;
  newLocal: string | null;
  /** New banner-position string (`"X% Y%"`), null when reset. */
  position?: string | null;
  rotation?: 0 | 90 | 180 | 270;
}

const latestCoverChanges = new Map<string, VnCoverChangedDetail>();

/** Return the last successful cover mutation dispatched in this browser session. */
export function getLatestCoverChange(vnId: string): VnCoverChangedDetail | null {
  if (typeof window === 'undefined') return null;
  return latestCoverChanges.get(vnId) ?? null;
}

/**
 * Dispatch a cover mutation to mounted artwork surfaces.
 *
 * @param detail Cover source and transform state to publish.
 * @param remember Whether late-hydrating consumers should replay the mutation.
 * @returns Nothing.
 */
export function dispatchCoverChanged(detail: VnCoverChangedDetail, remember = true): void {
  if (typeof window === 'undefined') return;
  if (remember) latestCoverChanges.set(detail.vnId, detail);
  window.dispatchEvent(new CustomEvent<VnCoverChangedDetail>(VN_COVER_CHANGED_EVENT, { detail }));
}

/** Type-safe dispatch helper for `VN_BANNER_CHANGED_EVENT`. SSR-safe (no-op on the server). */
export function dispatchBannerChanged(detail: VnBannerChangedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<VnBannerChangedDetail>(VN_BANNER_CHANGED_EVENT, { detail }));
}

/** Delegate a cover transform to the resident cover controls. SSR-safe. */
export function dispatchCoverAction(detail: VnCoverActionDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<VnCoverActionDetail>(VN_COVER_ACTION_EVENT, { detail }));
}

/** Open the resident banner focal-point editor for one VN. SSR-safe. */
export function dispatchBannerEdit(detail: VnBannerEditDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<VnBannerEditDetail>(VN_BANNER_EDIT_EVENT, { detail }));
}
