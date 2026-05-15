'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, RotateCw } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

/**
 * Route-segment error boundary. Catches any uncaught render error
 * below the `/app` segments (excluding pages with their own
 * `error.tsx`). Without this, an uncaught throw fell back to the
 * framework default — a blank screen in prod, a raw stack in dev.
 *
 * Logs to the browser console so developers can still inspect the
 * stack, then renders a friendly recovery UI with a Reset button
 * (calls `reset()` which re-mounts the segment) and a Home link.
 */
export default function GlobalSegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    console.error('Route error:', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
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
          <RotateCw className="h-4 w-4" />
          {t.errorBoundary.retry}
        </button>
        <Link href="/" className="btn">
          <Home className="h-4 w-4" />
          {t.errorBoundary.home}
        </Link>
      </div>
    </div>
  );
}
