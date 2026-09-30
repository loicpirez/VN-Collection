import { notFound } from 'next/navigation';
import { QaGlobalErrorProbe } from './QaGlobalErrorProbe';

export const dynamic = 'force-dynamic';

/** Expose the real global-error content only inside an isolated QA runtime. */
export default function QaGlobalErrorBoundaryPage() {
  if (process.env.VNCOLL_QA !== '1') notFound();
  return (
    <div
      style={{
        minHeight: '100vh',
        margin: 0,
        padding: 'clamp(16px, 5vw, 40px)',
        background: '#0b1220',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
        boxSizing: 'border-box',
      }}
    >
      <QaGlobalErrorProbe />
    </div>
  );
}
