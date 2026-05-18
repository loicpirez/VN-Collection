import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * R5-155 shared `<summary>` body. Native `<details>/<summary>`
 * disclosure triangles vary visibly across browsers (Firefox
 * shows a black filled triangle; Safari shows a smaller dark
 * caret; Chrome's is gray and tightly-spaced) and several `details`
 * usages in this codebase had hidden the triangle entirely
 * (`list-none`) without supplying a replacement, which made the
 * open / closed state genuinely unreadable.
 *
 * This helper renders a Lucide `<ChevronRight>` that rotates 90°
 * when the parent `<details>` is open via Tailwind's `group-open:`
 * variant. Drop the `group` class on the parent `<details>` for
 * the variant to apply.
 *
 * Usage:
 *   <details className="group">
 *     <summary className="cursor-pointer list-none ...">
 *       <CollapsibleSummary>Label</CollapsibleSummary>
 *     </summary>
 *     ...
 *   </details>
 *
 * The wrapper renders a flex row so callers can keep their own
 * trailing badge / counter / hint span next to the label.
 */
export function CollapsibleSummary({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <ChevronRight
        className="h-3 w-3 shrink-0 text-muted transition-transform duration-150 group-open:rotate-90"
        aria-hidden
      />
      {children}
    </span>
  );
}
