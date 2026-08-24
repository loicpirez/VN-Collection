'use client';

import { useEffect, useState } from 'react';

const SERVER_TIME_ZONE = 'UTC';

/**
 * Return a deterministic timezone during SSR and the browser timezone after
 * hydration, preventing locale-formatted timestamps from invalidating markup.
 *
 * @returns The timezone to pass to `Intl.DateTimeFormat`.
 */
export function useHydrationSafeTimeZone(): string {
  const [timeZone, setTimeZone] = useState(SERVER_TIME_ZONE);

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  return timeZone;
}
