'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export interface NavTab {
  href: string;
  label: string;
  isActive: boolean;
}

/**
 * Client-side tab strip for URL-state navigation (searchParam switches).
 *
 * Plain `<Link>` elements give no feedback between click and the server
 * re-render completing. This component uses `useTransition` + `router.push`
 * so the clicked tab shows a spinner while Next.js fetches the new page,
 * eliminating the dead-click feel on slower connections.
 *
 * Accessibility: active tab carries `aria-current="page"` (navigation
 * strip pattern, not `aria-selected` which requires a matching tabpanel).
 */
export function NavTabStrip({
  tabs,
  ariaLabel,
  className,
}: {
  tabs: NavTab[];
  ariaLabel: string;
  className?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending) setPendingHref(null);
  }, [isPending]);

  function go(href: string) {
    setPendingHref(href);
    startTransition(() => { router.push(href); });
  }

  return (
    <nav
      className={`inline-flex gap-1 rounded-md border border-border bg-bg-elev/30 p-1 text-xs ${className ?? ''}`}
      aria-label={ariaLabel}
    >
      {tabs.map(({ href, label, isActive }) => {
        const loading = isPending && pendingHref === href;
        return (
          <button
            key={href}
            type="button"
            onClick={() => go(href)}
            aria-current={isActive ? 'page' : undefined}
            disabled={isPending}
            className={`inline-flex items-center gap-1 rounded px-2.5 py-1 transition-colors disabled:cursor-wait ${
              isActive || loading
                ? 'bg-accent text-bg font-bold'
                : 'text-muted hover:text-white'
            }`}
          >
            {loading && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
            {label}
          </button>
        );
      })}
    </nav>
  );
}
