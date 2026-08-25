import { EgsPageSkeleton } from '@/components/EgsPageSkeleton';
import { getDict } from '@/lib/i18n/server';

export default async function EgsLoading() {
  const t = await getDict();
  return <EgsPageSkeleton label={t.common.loading} />;
}
