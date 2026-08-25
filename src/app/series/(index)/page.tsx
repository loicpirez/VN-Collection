import type { Metadata } from 'next';
import { getSeriesRepository } from '@/lib/db/repositories/series';
import { getDict } from '@/lib/i18n/server';
import { SeriesManager } from '@/components/SeriesManager';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.nav.series };
}

export default async function SeriesPage() {
  const series = await getSeriesRepository().list();
  return <SeriesManager initial={series} />;
}
