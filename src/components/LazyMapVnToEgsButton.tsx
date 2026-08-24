'use client';

import dynamic from 'next/dynamic';
import { Link2 } from 'lucide-react';
import { useState } from 'react';
import { useT } from '@/lib/i18n/client';
import type { MapVnToEgsButtonProps } from './MapVnToEgsButton';

const LazyMappingDialog = dynamic<MapVnToEgsButtonProps>(
  () => import('./MapVnToEgsButton').then((module) => module.MapVnToEgsButton),
  { ssr: false },
);

/** Props supported by the lightweight mapping trigger. */
export type LazyMapVnToEgsButtonProps = Omit<
  MapVnToEgsButtonProps,
  'initialOpen' | 'showTrigger'
>;

/**
 * Render a stable mapping command while deferring the search dialog chunk until
 * the command is invoked. A monotonically increasing request key remounts the
 * owner for subsequent opens after the user closes the dialog.
 */
export function LazyMapVnToEgsButton({
  vnId,
  seedQuery,
  variant = 'inline',
  triggerClassName,
  keepMenuOpen,
}: LazyMapVnToEgsButtonProps) {
  const t = useT();
  const [request, setRequest] = useState(0);
  const preload = () => { void import('./MapVnToEgsButton'); };
  const trigger = variant === 'compact' ? (
    <button
      type="button"
      onPointerEnter={preload}
      onFocus={preload}
      onClick={() => setRequest((value) => value + 1)}
      className="icon-chip inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[10px] font-medium text-muted hover:border-accent hover:text-accent sm:min-h-0"
      title={t.mapVn.title}
    >
      <Link2 className="h-3 w-3" aria-hidden />
      <span>{t.mapVn.cta}</span>
    </button>
  ) : (
    <button
      type="button"
      onPointerEnter={preload}
      onFocus={preload}
      onClick={() => setRequest((value) => value + 1)}
      className={triggerClassName ?? 'inline-flex min-h-[44px] w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-bg-elev hover:text-white sm:min-h-0'}
      title={t.mapVn.title}
      {...(keepMenuOpen ? { 'data-menu-keep-open': '' } : {})}
    >
      <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{t.mapVn.cta}</span>
    </button>
  );

  return (
    <>
      {trigger}
      {request > 0 ? (
        <LazyMappingDialog
          key={request}
          vnId={vnId}
          seedQuery={seedQuery}
          variant={variant}
          triggerClassName={triggerClassName}
          keepMenuOpen={keepMenuOpen}
          showTrigger={false}
          initialOpen
        />
      ) : null}
    </>
  );
}
