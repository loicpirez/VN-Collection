import type { CSSProperties } from 'react';

/** React style properties extended with standards-compliant CSS custom variables. */
export type CssCustomProperties = CSSProperties &
  Partial<Record<`--${string}`, string | number>>;
