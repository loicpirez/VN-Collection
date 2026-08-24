/** Recommendation modes shared by server and client components. */
export type RecommendMode =
  | 'because-you-liked'
  | 'tag-based'
  | 'hidden-gems'
  | 'highly-rated'
  | 'similar-to-vn';

/** Canonical recommendation mode values accepted by URLs and API bodies. */
export const RECOMMEND_MODES: readonly RecommendMode[] = [
  'because-you-liked',
  'tag-based',
  'hidden-gems',
  'highly-rated',
  'similar-to-vn',
];

/** Recommendation mode used when no valid explicit mode is supplied. */
export const DEFAULT_RECOMMEND_MODE: RecommendMode = 'because-you-liked';
