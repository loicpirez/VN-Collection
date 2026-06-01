/**
 * Physical-archive naming for the game-list export. Physical dumps are
 * shelved as `<Brand> - <Title> (<Year>)`. This module turns a collection
 * row into that exact string.
 */

/**
 * Structural shape {@link buildArchiveName} reads. Declared as a plain
 * interface rather than the full `CollectionItem` so it stays unit-testable
 * and decoupled from the dozens of unrelated VNDB fields a collection row
 * carries.
 */
export interface ArchiveNameSource {
  title: string;
  alttitle: string | null;
  released: string | null;
  developers: { name: string }[];
  publishers?: { name: string }[];
}

const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/**
 * The title to shelve under: the original-language title (`alttitle`, which
 * the collection stores as the Japanese script when one exists) with the
 * romaji/display `title` as the fallback. Verified against the real
 * collection: `alttitle` holds the Japanese script while `title` holds the
 * romaji, and some Latin-titled entries carry a null `alttitle` and so fall
 * through to `title`.
 */
function pickTitle(source: ArchiveNameSource): string {
  const alt = source.alttitle?.trim();
  if (alt) return alt;
  return source.title.trim();
}

/**
 * Primary brand: the first developer, then the first publisher as a
 * fallback. Returns an empty string when the VN records neither, in which
 * case {@link buildArchiveName} drops the `<Brand> - ` prefix rather than
 * inventing a placeholder.
 */
function pickBrand(source: ArchiveNameSource): string {
  for (const dev of source.developers) {
    const name = dev.name?.trim();
    if (name) return name;
  }
  for (const pub of source.publishers ?? []) {
    const name = pub.name?.trim();
    if (name) return name;
  }
  return '';
}

/**
 * Four-digit release year, or `null` when the VN has no usable date. VNDB
 * stores `released` as `YYYY-MM-DD`, `YYYY-MM`, `YYYY`, or `TBA`; only a
 * leading four-digit run that is not `0000` counts, so the caller omits the
 * `(YYYY)` suffix entirely instead of printing a misleading `(0)`.
 */
function pickYear(released: string | null): string | null {
  const raw = released?.trim();
  if (!raw) return null;
  const match = /^(\d{4})/.exec(raw);
  if (!match || match[1] === '0000') return null;
  return match[1];
}

/**
 * Replace filesystem-illegal characters (`\ / : * ? " < > |`) with a space
 * and collapse the gaps so each line is safe to use verbatim as a folder
 * name on Windows, macOS, and Linux (matching how the physical archive is
 * laid out). The slash matters most: a title containing one would otherwise
 * read as a path separator.
 */
function sanitizeSegment(value: string): string {
  return value.replace(ILLEGAL_FILENAME_CHARS, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Build one archive line for a game: `<Brand> - <Title> (<Year>)`.
 *
 * The `<Brand> - ` prefix is dropped when no developer/publisher is
 * recorded, and the ` (<Year>)` suffix is dropped when no release year is
 * known, so the line never contains an empty placeholder.
 */
export function buildArchiveName(source: ArchiveNameSource): string {
  const brand = sanitizeSegment(pickBrand(source));
  const title = sanitizeSegment(pickTitle(source));
  const year = pickYear(source.released);
  const head = brand ? `${brand} - ${title}` : title;
  return year ? `${head} (${year})` : head;
}

/**
 * Order two games by brand then title, case-insensitively and locale-aware
 * so kana/kanji and Latin titles interleave sensibly. Pairs with
 * {@link buildArchiveName} to produce a shelf-ordered listing.
 */
export function compareArchiveSource(a: ArchiveNameSource, b: ArchiveNameSource): number {
  const brandCmp = pickBrand(a).localeCompare(pickBrand(b), undefined, { sensitivity: 'base' });
  if (brandCmp !== 0) return brandCmp;
  return pickTitle(a).localeCompare(pickTitle(b), undefined, { sensitivity: 'base' });
}
