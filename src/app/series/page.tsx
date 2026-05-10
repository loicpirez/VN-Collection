import { listSeries } from '@/lib/db';
import { SeriesManager } from '@/components/SeriesManager';

export const dynamic = 'force-dynamic';

export default function SeriesPage() {
  const series = listSeries();
  return <SeriesManager initial={series} />;
}
