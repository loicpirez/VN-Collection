import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * Responsive back link for detail pages.
 *
 * Below md (mobile / tablet): full-text arrow link — the only realistic
 * way back when the navbar is collapsed into the mobile sheet.
 *
 * At md+: collapses to a subtle bordered icon-chip at 70% opacity (100%
 * on hover). The desktop navbar already carries the destination link,
 * so a wide full-width "← Bibliothèque" row above every detail page
 * just wastes vertical space.
 *
 * The label stays in `aria-label` + `title` for screen-reader users on
 * both breakpoints. Use this on every detail page that previously
 * inlined the canonical
 * `<Link className="mb-4 inline-flex items-center gap-1 text-sm
 * text-muted hover:text-white">` pattern.
 */
export function BackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="mb-4 inline-flex items-center gap-1 rounded-md border border-transparent text-sm text-muted hover:text-white md:mb-2 md:border-border md:bg-bg-elev/30 md:px-1.5 md:py-1 md:text-[11px] md:opacity-70 md:hover:border-accent md:hover:opacity-100"
    >
      <ArrowLeft className="h-4 w-4 md:h-3 md:w-3" aria-hidden />
      <span className="md:hidden">{label}</span>
    </Link>
  );
}
