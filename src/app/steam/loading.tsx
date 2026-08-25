import { SteamPageSkeleton } from '@/components/SteamPageSkeleton';
import { getDict } from '@/lib/i18n/server';

export default async function Loading() {
  const t = await getDict();
  return <SteamPageSkeleton label={t.common.loading} />;
}
