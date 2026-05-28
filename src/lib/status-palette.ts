/**
 * Status palette — the single source of truth for status hex codes.
 *
 * `tailwind.config.ts` (theme.extend.colors.status.*) drives every
 * Tailwind class (`text-status-playing`, `bg-status-completed/10`,
 * etc.). When we need to feed the hex values into something that
 * isn't a Tailwind class — e.g. an inline SVG <fill>, a Recharts
 * series colour, or a chart donut slice — we read from THIS file.
 *
 * Keep the keys + values byte-identical to `tailwind.config.ts`.
 * values inline; if the palette ever drifted, the donut chart would
 * be silently out of sync with the chips on every other surface.
 */
export const STATUS_HEX = {
  planning: '#475569',
  playing: '#3b82f6',
  completed: '#22c55e',
  on_hold: '#f59e0b',
  dropped: '#ef4444',
} as const;

export type StatusKey = keyof typeof STATUS_HEX;

/**
 * Fallback hex for any status string that isn't one of the canonical
 * five (e.g. a future `wishlist` status, or a malformed row).
 * Mirrors the muted text colour from the palette.
 */
export const STATUS_HEX_FALLBACK = '#64748b';

export function statusHex(status: string): string {
  return (STATUS_HEX as Record<string, string>)[status] ?? STATUS_HEX_FALLBACK;
}
