import { UserCircle } from 'lucide-react';
import { quoteAvatarSrc, type QuoteAvatarSource } from '@/lib/quote-avatar';

/**
 * 32×32 rounded character avatar for a quote, with a lucide
 * `UserCircle` fallback when no local character image is available.
 *
 * Kept presentational (no fetches, no client hooks) so it can be
 * dropped into every quote surface — the server-rendered `/quotes`
 * page, the client-side `QuotesSection`, and the floating
 * `QuoteFooter` — without dragging in `'use client'`.
 *
 * Sizing comes from the `size` prop (defaults to 32 px). Both the
 * `<img>` and the fallback icon are wrapped in the same `inline-flex`
 * container so the surrounding text baseline stays stable regardless
 * of which branch renders.
 *
 * The image deliberately uses a native `<img>` (no `<SafeImage>`):
 * - Character avatars never carry NSFW gating; the `character_image`
 *   table only stores VNDB's portrait crop which is already SFW.
 * - The lazy-loader machinery in `<SafeImage>` is overkill for a
 *   single 32 px thumbnail rendered in a list of 3–20 quotes.
 */
export function QuoteAvatar({
  quote,
  size = 32,
  className = '',
  alt,
}: {
  quote: QuoteAvatarSource | null | undefined;
  /** Pixel size; the wrapper is square. Defaults to 32 px (Material small avatar). */
  size?: number;
  className?: string;
  /** Optional alt text override. Falls back to the character name when omitted. */
  alt?: string;
}) {
  const src = quoteAvatarSrc(quote);
  const characterName =
    (quote?.character as { name?: string } | null | undefined)?.name ??
    (quote as { character_name?: string | null } | undefined)?.character_name ??
    '';
  const altText = alt ?? characterName ?? '';
  const dim = { width: size, height: size };

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-bg-elev/60 text-muted ${className}`}
      style={dim}
      aria-hidden={src ? undefined : true}
    >
      {src ? (
        <img
          src={src}
          alt={altText}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <UserCircle className="h-3/4 w-3/4" aria-hidden />
      )}
    </span>
  );
}
