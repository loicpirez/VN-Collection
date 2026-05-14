import type { Metadata } from 'next';
import { getCacheFreshness } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { TraitsBrowser } from '@/components/TraitsBrowser';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.nav.traits };
}

export default function TraitsPage() {
  const lastUpdatedAt = getCacheFreshness(['% /trait|%', 'trait_full:%']);
  return <TraitsBrowser lastUpdatedAt={lastUpdatedAt} />;
}
