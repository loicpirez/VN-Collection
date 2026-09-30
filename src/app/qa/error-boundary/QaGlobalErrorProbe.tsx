'use client';

import { useState } from 'react';
import { GlobalErrorContent } from '@/app/global-error';

/** Render the production global-error content in a resettable QA state. */
export function QaGlobalErrorProbe() {
  const [active, setActive] = useState(true);
  if (!active) {
    return <p role="status">Global error reset completed</p>;
  }
  return (
    <GlobalErrorContent
      error={Object.assign(new Error('QA global boundary probe'), { digest: 'qa-boundary-probe' })}
      reset={() => setActive(false)}
    />
  );
}
