'use client';
import { useSearchParams } from 'next/navigation';
import { type ReactNode } from 'react';
import {
  type DensityScope,
  resolveScopedDensity,
  useDisplaySettings,
} from '@/lib/settings/client';

/**
 * Client island that sets `--card-density-px` on its wrapping `<div>`
 * (not on the document root) so each surface scopes its own value.
 * Server-rendered grids inside still read `var(--card-density-px,
 * 220px)`; thanks to CSS variable inheritance the override only
 * applies to the children of this provider.
 *
 * Mount once at the top of every listing page that has a
 * `<CardDensitySlider scope="…" />`. The slider writes
 * `settings.density[scope]` and the provider re-emits the CSS
 * variable, so the surface reacts without a reload.
 *
 * Mounting two providers with different scopes on the same page is
 * supported — each provider's children inherit only their own
 * variable.
 */
export function DensityScopeProvider({
  scope,
  children,
  className,
  /**
   * `as` lets the caller pick the wrapper element so the provider
   * doesn't bake in `<div>` when the surrounding markup needs a
   * `<section>` / `<article>` / `<main>` instead. We don't proxy
   * every HTML attribute — keep it focused on the few props pages
   * actually need.
   */
  as: As = 'div',
}: {
  scope: DensityScope;
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'main' | 'article' | 'aside';
}) {
  const { settings } = useDisplaySettings();
  const search = useSearchParams();
  const urlDensity = search?.get('density') ?? null;
  const value = resolveScopedDensity(settings, scope, urlDensity);
  // We MUST set the variable as inline style so it cascades to every
  // descendant. The cast keeps TypeScript happy about the
  // CSS-custom-property key.
  const style = { ['--card-density-px' as never]: `${value}px` } as React.CSSProperties;
  const Tag = As as 'div';
  return (
    <Tag className={className} style={style}>
      {children}
    </Tag>
  );
}
