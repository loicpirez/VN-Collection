'use client';
import { Settings2 } from 'lucide-react';

/**
 * Client-side button that dispatches `vn:open-settings` with the
 * given tab so a server-rendered page (`/data`, etc.) can deep-link
 * into the Settings modal without violating the
 * "no event handlers across the server→client boundary" rule.
 *
 * Server components can't pass `onClick` directly into a Client
 * Component's prop — the previous implementation tried that on
 * `/data` and Next.js correctly errored out. Encapsulating the
 * handler INSIDE this Client Component is the canonical fix.
 */
export function OpenSettingsButton({ tab, label }: { tab: 'integrations' | 'account' | 'automation' | 'display' | 'content' | 'library' | 'home' | 'vn-page'; label: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vn:open-settings', { detail: { tab } }));
        }
      }}
      className="btn"
    >
      <Settings2 className="h-4 w-4" aria-hidden /> {label}
    </button>
  );
}
