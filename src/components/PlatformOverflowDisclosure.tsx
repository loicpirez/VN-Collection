'use client';
import Link from 'next/link';
import { ChevronDown, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { PortalPopover } from './PortalPopover';

interface PlatformDisclosureItem {
  /** Raw VNDB platform code used by search filters. */
  code: string;
  /** Human-readable platform name resolved by the server. */
  label: string;
}

interface Props {
  /** Hidden platform links revealed by the disclosure. */
  items: PlatformDisclosureItem[];
  /** Compact trigger copy, for example "+5". */
  moreLabel: string;
  /** Localized platform section label. */
  label: string;
  /** Localized close-button label supplied by the server dictionary. */
  closeLabel: string;
}

/** Accessible click, keyboard, and touch disclosure for overflow platforms. */
export function PlatformOverflowDisclosure({ items, moreLabel, label, closeLabel }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const fullLabel = items.map((item) => item.label).join(', ');
  const dialogLabel = `${label}: ${moreLabel}`;

  return (
    <span className="inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded border border-border bg-bg-elev/40 px-2 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent can-hover:sm:min-h-[28px] can-hover:sm:px-1.5 can-hover:sm:py-0.5"
        title={fullLabel}
        aria-label={`${moreLabel}: ${fullLabel}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
      >
        {moreLabel}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      <PortalPopover
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        label={dialogLabel}
        panelId={panelId}
        panelClassName="overflow-y-auto border border-border bg-bg-card p-2 shadow-card max-sm:rounded-t-lg sm:max-w-72 sm:rounded-md"
      >
        <div className="mb-1 flex min-h-[44px] items-center justify-between gap-3 border-b border-border/60 pb-1 sm:hidden">
          <h2 className="text-sm font-semibold text-white">{label}</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted hover:bg-bg-elev hover:text-white"
            aria-label={closeLabel}
            title={closeLabel}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <Link
              key={item.code}
              href={`/search?platforms=${encodeURIComponent(item.code)}`}
              title={item.label}
              aria-label={`${item.label} (${item.code})`}
              onClick={() => setOpen(false)}
              className="inline-flex min-h-[44px] items-center rounded border border-border bg-bg-elev/40 px-2 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent can-hover:sm:min-h-[28px] can-hover:sm:px-1.5 can-hover:sm:py-0.5"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </PortalPopover>
    </span>
  );
}
