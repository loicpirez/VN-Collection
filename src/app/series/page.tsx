import type { Metadata } from 'next';
import { listSeries } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { SeriesManager } from '@/components/SeriesManager';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.nav.series };
}

export default function SeriesPage() {
  const series = listSeries();
  return <SeriesManager initial={series} />;
}
