'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export interface ModeTabItem {
  id: string;
  href: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  active: boolean;
}

export function RecommendModeTabs({
  tabs,
  ariaLabel,
}: {
  tabs: ModeTabItem[];
  ariaLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <nav
      className="mt-4 inline-flex flex-wrap gap-1 rounded-md border border-border bg-bg-elev/30 p-1 text-xs"
      aria-label={ariaLabel}
      aria-busy={isPending}
    >
      {tabs.map(({ id, href, label, hint, icon: Icon, active }) => (
        <button
          key={id}
          type="button"
          title={hint}
          aria-current={active ? 'page' : undefined}
          disabled={isPending && !active}
          onClick={() => {
            if (active) return;
            startTransition(() => router.push(href));
          }}
          className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors disabled:opacity-50 ${
            active
              ? 'bg-accent text-bg font-bold'
              : 'text-muted hover:text-white'
          }`}
        >
          {isPending && active ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Icon className="h-3.5 w-3.5" aria-hidden />
          )}
          {label}
        </button>
      ))}
    </nav>
  );
}
