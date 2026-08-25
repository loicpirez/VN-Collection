'use client';

import { useT } from '@/lib/i18n/client';
import { PAGE_SPACE_SCOPES } from '@/lib/page-space';
import { SkeletonBlock } from '../Skeleton';

const PROXY_SECTION_COUNT = 4;

/**
 * Loading surface for the per-page layout settings chunk.
 *
 * @returns A destination-shaped placeholder for the layout tabs and route rows.
 */
export function LayoutSettingsTabSkeleton() {
  const t = useT();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-4"
      data-settings-layout-skeleton
    >
      <span className="sr-only">{t.app.loading}</span>
      <div className="flex gap-1 overflow-hidden rounded-lg border border-border bg-bg-elev/20 p-1">
        <SkeletonBlock className="h-11 w-24 shrink-0 rounded-md" />
        <SkeletonBlock className="h-11 w-24 shrink-0 rounded-md" />
        <SkeletonBlock className="h-11 w-28 shrink-0 rounded-md" />
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg-elev/50 p-3">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-3 w-full max-w-80" />
        <ul className="mt-1 grid gap-2" data-settings-layout-rows>
          {PAGE_SPACE_SCOPES.map((scope) => (
            <li
              key={scope}
              className="grid gap-2 rounded-md border border-border/60 bg-bg-card/40 px-2 py-2 lg:grid-cols-[minmax(7rem,auto)_minmax(0,1fr)]"
            >
              <div className="space-y-1">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-2.5 w-28" />
              </div>
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <SkeletonBlock key={index} className="h-11 w-20 rounded-md" />
                  ))}
                </div>
                <SkeletonBlock className="h-14 w-full rounded-md" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function CredentialSectionSkeleton({ fields }: { fields: number }) {
  return (
    <section className="space-y-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <SkeletonBlock className="h-4 w-28" />
      <SkeletonBlock className="h-3 w-full max-w-72" />
      {Array.from({ length: fields }).map((_, index) => (
        <div key={index} className="space-y-1">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="h-10 w-full rounded-md" />
          <SkeletonBlock className="h-2.5 w-48 max-w-full" />
        </div>
      ))}
    </section>
  );
}

/**
 * Loading surface for the integrations settings chunk.
 *
 * @returns A destination-shaped placeholder for credentials, proxies, and provider controls.
 */
export function IntegrationsSettingsTabSkeleton() {
  const t = useT();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-6"
      data-settings-integrations-skeleton
    >
      <span className="sr-only">{t.app.loading}</span>
      <CredentialSectionSkeleton fields={2} />
      <CredentialSectionSkeleton fields={1} />
      <div className="space-y-5" data-settings-proxy-sections>
        {Array.from({ length: PROXY_SECTION_COUNT }).map((_, index) => (
          <section key={index} className="space-y-3 border-t border-border pt-5">
            <SkeletonBlock className="h-4 w-36" />
            <SkeletonBlock className="h-3 w-full max-w-72" />
            <SkeletonBlock className="h-4 w-24" />
            <div className="grid grid-cols-[5rem_1fr] items-center gap-x-3 gap-y-2">
              {Array.from({ length: 5 }).map((__, fieldIndex) => (
                <div key={fieldIndex} className="contents">
                  <SkeletonBlock className="h-3 w-16" />
                  <SkeletonBlock className="h-9 w-full rounded-md" />
                </div>
              ))}
            </div>
            <SkeletonBlock className="h-11 w-20 rounded-md" />
          </section>
        ))}
      </div>
      <section className="space-y-3 border-t border-border pt-5">
        <SkeletonBlock className="h-4 w-36" />
        <SkeletonBlock className="h-3 w-full max-w-80" />
        <div className="grid gap-1.5 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      </section>
      <SkeletonBlock className="h-16 w-full rounded-md" />
      <SkeletonBlock className="h-11 w-full rounded-md" />
      <section className="space-y-3 border-t border-border pt-5">
        <SkeletonBlock className="h-4 w-32" />
        <SkeletonBlock className="h-3 w-full max-w-72" />
        <div className="flex gap-1">
          <SkeletonBlock className="h-11 w-20 rounded-md" />
          <SkeletonBlock className="h-11 w-20 rounded-md" />
        </div>
      </section>
    </div>
  );
}
