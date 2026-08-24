import type { Metadata } from 'next';
import { getCacheRepository } from '@/lib/db/repositories/cache';
import { getDict } from '@/lib/i18n/server';
import { TraitsBrowser } from '@/components/TraitsBrowser';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.nav.traits };
}

export default async function TraitsPage() {
  const lastUpdatedAt = await getCacheRepository().freshness(['% /trait|%', 'trait_full:%']);
  return <TraitsBrowser lastUpdatedAt={lastUpdatedAt} />;
}
