import { notFound } from 'next/navigation';
import { QaStatefulSurfaces } from './QaStatefulSurfaces';

export const dynamic = 'force-dynamic';

/** Expose deterministic stateful component fixtures only in isolated QA runtimes. */
export default function QaStatefulSurfacesPage() {
  if (process.env.VNCOLL_QA !== '1') notFound();
  return <QaStatefulSurfaces />;
}
