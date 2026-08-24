'use client';
import { useEffect } from 'react';
import type { ComponentType } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Home, RotateCw } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

/** Props supplied by a Next.js route-segment error boundary. */
export interface RouteErrorProps {
  /** Uncaught segment error, including the optional production digest. */
  error: Error & { digest?: string };
  /** Re-mount the failed route segment. */
  reset: () => void;
}

/** Route-specific configuration retained around the shared recovery view. */
export interface RouteErrorConfig {
  /** Stable browser-console prefix identifying the failed route. */
  logLabel: string;
  /** Safe local destination offered when retrying is not useful. */
  returnHref: string;
}

/**
 * Render the common accessible recovery surface for one failed route segment.
 *
 * @param props Next.js error-boundary props plus route-specific configuration.
 * @returns Alert UI with retry, digest, and route-aware return controls.
 */
export function RouteErrorView({
  error,
  reset,
  logLabel,
  returnHref,
}: RouteErrorProps & RouteErrorConfig) {
  const t = useT();
  const returnsHome = returnHref === '/';
  const ReturnIcon = returnsHome ? Home : ArrowLeft;

  useEffect(() => {
    console.error(`${logLabel}:`, error);
  }, [error, logLabel]);

  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-status-dropped" aria-hidden />
      <h1 className="mb-2 text-xl font-bold">{t.errorBoundary.title}</h1>
      <p className="mb-4 text-sm text-muted">{t.errorBoundary.body}</p>
      {error.digest && (
        <p className="mb-4 font-mono text-[11px] text-muted/70">
          {t.errorBoundary.digestLabel}: {error.digest}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={reset} className="btn btn-primary">
          <RotateCw className="h-4 w-4" aria-hidden />
          {t.errorBoundary.retry}
        </button>
        <Link href={returnHref} className="btn">
          <ReturnIcon className="h-4 w-4" aria-hidden />
          {returnsHome ? t.errorBoundary.home : t.errorBoundary.back}
        </Link>
      </div>
    </div>
  );
}

/**
 * Create a thin route-specific Next.js error boundary around the shared view.
 *
 * @param config Stable log label and return destination for the route.
 * @returns Client component accepting the standard Next.js boundary props.
 */
export function createRouteErrorBoundary(config: RouteErrorConfig): ComponentType<RouteErrorProps> {
  return function RouteErrorBoundary(props: RouteErrorProps) {
    return <RouteErrorView {...props} {...config} />;
  };
}
