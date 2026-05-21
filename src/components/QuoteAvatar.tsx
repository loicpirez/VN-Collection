import { UserCircle } from 'lucide-react';
import { resolveQuoteAvatar, type QuoteAvatarSource } from '@/lib/quote-avatar';
import { LoadingImage } from './LoadingImage';

/**
 * Rounded character avatar for a quote, with a richer fallback chain:
 *   - Character portrait (1:1, rendered at the requested `size`).
 *   - VN cover (2:3, rendered taller than wide — 32×48 by default
 *     when `size = 32`). The 2:3 ratio reflects the actual aspect
 *     of every cover the app stores.
 *   - `<UserCircle>` lucide icon when neither is available.
 *
 * Uses the lightweight loading skeleton wrapper instead of SafeImage:
 * avatars never carry NSFW gating, but they still need the same
 * no-alt-flash loading behavior as the larger image surfaces.
 */
export function QuoteAvatar({
  quote,
  size = 32,
  className = '',
  alt,
}: {
  quote: QuoteAvatarSource | null | undefined;
  /** Pixel size; the character frame is square, the VN-cover frame is `size × size*1.5`. */
  size?: number;
  className?: string;
  /** Optional alt text override. Falls back to the character name when omitted. */
  alt?: string;
}) {
  const resolved = resolveQuoteAvatar(quote);
  const characterName =
    (quote?.character as { name?: string } | null | undefined)?.name ??
    (quote as { character_name?: string | null } | undefined)?.character_name ??
    '';
  const altText = alt ?? characterName ?? '';

  // Covers are 2:3 — render a taller frame so the cover doesn't get
  // squashed into a square. Character portraits stay 1:1.
  const isCover = resolved.kind === 'vnCover';
  const width = size;
  const height = isCover ? Math.round(size * 1.5) : size;
  const radiusClass = isCover ? 'rounded-md' : 'rounded-full';

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-border bg-bg-elev/60 text-muted ${radiusClass} ${className}`}
      style={{ width, height }}
      aria-hidden={resolved.src ? undefined : true}
    >
      {resolved.src ? (
        <LoadingImage
          src={resolved.src}
          alt={altText}
          width={width}
          height={height}
          className="h-full w-full"
          imageClassName="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <UserCircle className="h-3/4 w-3/4" aria-hidden />
      )}
    </span>
  );
}
