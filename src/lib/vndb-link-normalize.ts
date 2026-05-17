/**
 * Normalise VNDB-flavoured hyperlinks so internal references rewrite to
 * the matching local App Router route instead of dead `/cNNN` paths or
 * external `https://vndb.org/cNNN` links the operator probably wants to
 * stay in-app for.
 *
 * VNDB BBCode descriptions ship with link payloads in three rough
 * shapes:
 *   1. Absolute external URLs (`https://vndb.org/c8646`).
 *   2. Bare entity ids (`c8646`) inside `[url=...]label[/url]`.
 *   3. Already-relative `/c8646` that an earlier ingest may have left
 *      pointing at the broken top-level route.
 *
 * Each of those three is mapped to the canonical internal route. Ids
 * that have NO internal route (`d`=doc, `u`=user, `t`=thread,
 * `w`=review) keep the external URL — we don't want to silently 404
 * inside the app for those.
 *
 * Decision: normalisation runs at RENDER time (via VndbMarkup +
 * CustomSynopsis), NOT during ingest. The cache layer (`vndb-cache.ts`)
 * stores raw VNDB payloads exactly as received, so any future change to
 * the route table or normaliser policy applies retroactively to every
 * cached description without a full cache rebuild. The ingest path
 * stays untouched.
 *
 * Pure function — no side effects, safe to call from server components,
 * client components, and unit tests alike.
 */

const ROUTE_MAP: Record<string, string> = {
  v: 'vn',
  c: 'character',
  r: 'release',
  p: 'producer',
  g: 'tag',
  i: 'trait',
  s: 'staff',
};

const VNDB_ABS_RE = /^https?:\/\/(?:www\.)?vndb\.org\/([a-z])(\d+)(?:[/?#].*)?$/i;
const BARE_REF_RE = /^([a-z])(\d+)$/i;
const RELATIVE_REF_RE = /^\/([a-z])(\d+)(?:[/?#].*)?$/i;

function buildInternalRoute(prefix: string, num: string): string | null {
  const route = ROUTE_MAP[prefix.toLowerCase()];
  if (!route) return null;
  return `/${route}/${prefix.toLowerCase()}${num}`;
}

export function normalizeVndbHref(href: string | null | undefined): string {
  if (href == null) return '';
  const trimmed = `${href}`.trim();
  if (!trimmed) return '';

  // 1. Absolute vndb.org URL → internal route if the prefix is known,
  //    otherwise keep the original external URL untouched.
  const abs = VNDB_ABS_RE.exec(trimmed);
  if (abs) {
    const mapped = buildInternalRoute(abs[1], abs[2]);
    return mapped ?? trimmed;
  }

  // 2. Bare id (`c8646`) — typed inside `[url=…]` by VNDB editors as
  //    shorthand. Map to internal when possible; pass through when not
  //    (a string like `foo` should not be touched).
  const bare = BARE_REF_RE.exec(trimmed);
  if (bare) {
    const mapped = buildInternalRoute(bare[1], bare[2]);
    return mapped ?? trimmed;
  }

  // 3. Already-relative `/c8646` — the historical broken form. Map it
  //    to the same internal route the absolute URL resolves to.
  const rel = RELATIVE_REF_RE.exec(trimmed);
  if (rel) {
    const mapped = buildInternalRoute(rel[1], rel[2]);
    if (mapped) return mapped;
    // Unknown prefix on a relative path → leave alone; the app router
    // will 404 it but that's the same as today and at least makes the
    // bad input visible in logs / dev tools.
    return trimmed;
  }

  // Anything else (external non-VNDB URL, mailto, fragment-only, etc.)
  // is returned unchanged.
  return trimmed;
}
