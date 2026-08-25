import { UpcomingRouteSkeleton } from '@/components/UpcomingSkeleton';
import { getDict } from '@/lib/i18n/server';

export default async function Loading() {
  const t = await getDict();
  return <UpcomingRouteSkeleton label={t.common.loading} />;
}
