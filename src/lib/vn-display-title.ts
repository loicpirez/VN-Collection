/** Minimal title data required to resolve the VN heading and browser title. */
export interface VnDisplayTitleInput {
  title: string;
  alttitle?: string | null;
  titles: ReadonlyArray<{
    title: string;
    latin?: string | null;
  }>;
}

/** Resolved title pair shared by metadata and the visible VN heading. */
export interface VnDisplayTitles {
  primary: string;
  alternate: string | undefined;
}

function titleCandidates(vn: VnDisplayTitleInput): string[] {
  const candidates = [
    vn.title,
    vn.alttitle,
    ...vn.titles.flatMap((title) => [title.title, title.latin]),
  ];
  return candidates
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim());
}

/**
 * Resolve one canonical VN title pair for every detail-page surface.
 *
 * A cached row can contain a shortened title while VNDB title metadata holds
 * the full form. When a longer candidate contains the cached title, the
 * shortest matching candidate becomes primary; the displaced title remains
 * available as the alternate. This keeps the browser title, visible heading,
 * recent-view entry, cover alt text, and stock lookup title synchronized.
 *
 * @param vn - Cached VN title fields.
 * @returns Shared primary and optional alternate display titles.
 */
export function resolveVnDisplayTitles(vn: VnDisplayTitleInput): VnDisplayTitles {
  const current = vn.title.trim();
  const normalized = current.toLowerCase();
  const longerContainingCurrent = titleCandidates(vn)
    .filter((candidate) => {
      const lower = candidate.toLowerCase();
      return lower !== normalized && lower.includes(normalized) && candidate.length > current.length;
    })
    .sort((a, b) => a.length - b.length)[0];
  const primary = longerContainingCurrent ?? current;
  const resolvedAlternate =
    vn.alttitle && vn.alttitle !== primary
      ? vn.alttitle
      : primary !== current
        ? current
        : vn.alttitle;
  return {
    primary,
    alternate: resolvedAlternate && resolvedAlternate !== primary
      ? resolvedAlternate
      : undefined,
  };
}
