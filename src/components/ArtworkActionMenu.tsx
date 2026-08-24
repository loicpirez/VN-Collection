'use client';
import { ChevronDown, Pencil, X } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { PortalPopover } from './PortalPopover';

interface Props {
  /** Accessible and visible desktop label for the artwork surface. */
  label: string;
  /** Responsive trigger styling supplied by the VN action bar. */
  triggerClassName: string;
  /** Artwork operations rendered inside the portal surface. */
  children: ReactNode;
}

/** Responsive artwork menu: anchored popover on desktop, bottom sheet on mobile. */
export function ArtworkActionMenu({ label, triggerClassName, children }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  return (
    <span className="inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        aria-label={label}
        title={label}
        className={triggerClassName}
      >
        <Pencil className="h-4 w-4" aria-hidden />
        <span className="sr-only sm:not-sr-only">{label}</span>
        <ChevronDown className="hidden h-3 w-3 sm:block" aria-hidden />
      </button>
      <PortalPopover
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        label={label}
        panelId={panelId}
        panelClassName="overflow-y-auto border border-border bg-bg-card p-3 text-sm shadow-card max-sm:rounded-t-lg sm:w-72 sm:rounded-lg"
      >
        <div className="mb-2 flex min-h-[44px] items-center justify-between gap-3 border-b border-border/60 pb-2">
          <h2 className="text-sm font-semibold text-white">{label}</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted hover:bg-bg-elev hover:text-white"
            aria-label={label}
            title={label}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-menu-keep-open]')) return;
            if (target.closest('a, button')) setOpen(false);
          }}
        >
          {children}
        </div>
      </PortalPopover>
    </span>
  );
}
