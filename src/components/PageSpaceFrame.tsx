'use client';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';
import {
  isPageSpacePreset,
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
 * @param props.className Optional classes layered on the frame element.
 * @returns Content wrapped in a responsive page-spacing shell.
 */
export function PageSpaceFrame({ children, className }: { children: ReactNode; className?: string }) {
  const pathname = usePathname() ?? '/';
  const scope = resolvePageSpaceScope(pathname);
  const { settings } = useDisplaySettings();
  const preset = isPageSpacePreset(settings.globalPageSpace)
    ? settings.globalPageSpace
    : resolvePageSpacePreset(settings, scope);

  return (
    <div
      className={className ? `page-space-frame ${className}` : 'page-space-frame'}
      data-page-space-scope={scope}
      data-page-space-preset={preset}
      style={pageSpaceStyle(preset)}
    >
      {children}
    </div>
  );
}

/**
 * Header-specific spacing frame. The navbar is stable by default so
 * route changes do not make the header jump; users can opt into
 * matching the active page width from Display settings.
 *
 * @param props.children Header content rendered inside the frame.
 * @param props.className Optional classes layered on the frame element.
 * @returns Header content wrapped in a responsive spacing shell.
 */
export function HeaderSpaceFrame({ children, className }: { children: ReactNode; className?: string }) {
  const pathname = usePathname() ?? '/';
  const { settings } = useDisplaySettings();
  const scope = settings.headerFollowsPageSpace ? resolvePageSpaceScope(pathname) : 'library';
  const preset = settings.headerFollowsPageSpace ? resolvePageSpacePreset(settings, scope) : 'standard';

  return (
    <div
      className={className ? `page-space-frame ${className}` : 'page-space-frame'}
      data-page-space-scope={settings.headerFollowsPageSpace ? scope : 'navbar'}
      data-page-space-preset={preset}
      style={pageSpaceStyle(preset)}
    >
      {children}
    </div>
  );
}
