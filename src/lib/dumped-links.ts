/**
 * URL helpers for the /dumped page row anchors. Centralised so the
 * test suite pins the exact shape — drift here used to mean the
 * "Voir sur l'étagère" link and the "My editions" anchor pointed
 * to slightly different locations across page revisions.
 *
 * - `dumpedVnHref(id)` → `/vn/<id>` for the row title.
 * - `dumpedEditionsAnchor(id)` → `/vn/<id>#my-editions` for the
 *   "Add an edition" CTA on rows without owned editions. The anchor
 *   matches the section id registered in `vn-detail-layout.ts`.
 * - `dumpedShelfHref(id)` → `/shelf?view=layout&highlight=<id>` so
 *   the layout editor can scroll the row's slot into view. The
 *   `view=layout` param is the deep-link target spec'd in CLAUDE.md;
 *   `highlight` is forward-compatible — the editor reads it when
 *   present and falls back to the default placement on mount.
 */
export function dumpedVnHref(vnId: string): string {
  return `/vn/${vnId}`;
}

export function dumpedEditionsAnchor(vnId: string): string {
  return `/vn/${vnId}#my-editions`;
}

export function dumpedShelfHref(vnId: string): string {
  return `/shelf?view=layout&highlight=${encodeURIComponent(vnId)}`;
}
