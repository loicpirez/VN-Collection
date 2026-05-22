'use client';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';
import {
  pageSpaceStyle,
  resolvePageSpacePreset,
  resolvePageSpaceScope,
} from '@/lib/page-space';
import { useDisplaySettings } from '@/lib/settings/client';

/**
 * Persistent layout frame that applies the current route group's page
 * spacing preference. It owns only the outer content width / gutters;
 * cards, panels, and detail sections keep their own internal padding.
 *
 * @param props.children Page content rendered inside the shared frame.
 * @returns Content wrapped in a responsive page-spacing shell.
 */
export function PageSpaceFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const scope = resolvePageSpaceScope(pathname);
  const { settings } = useDisplaySettings();
  const preset = resolvePageSpacePreset(settings, scope);

  return (
    <div
      className="page-space-frame"
      data-page-space-scope={scope}
      data-page-space-preset={preset}
      style={pageSpaceStyle(preset)}
    >
      {children}
    </div>
  );
}
