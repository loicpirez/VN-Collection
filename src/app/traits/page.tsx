import { getCacheFreshness } from '@/lib/db';
import { TraitsBrowser } from '@/components/TraitsBrowser';

export const dynamic = 'force-dynamic';

export default function TraitsPage() {
  const lastUpdatedAt = getCacheFreshness(['/trait|%', 'trait_full:%']);
  return <TraitsBrowser lastUpdatedAt={lastUpdatedAt} />;
}
