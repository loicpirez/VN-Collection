import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getDict } from '@/lib/i18n/server';

export default async function NotFound() {
  const t = await getDict();
  // The global not-found template fires for every notFound() call across
  // the app — VN, producer, staff, character, series, list. The old
  // "VN not found" wording lied on every non-VN route, so the message
  // is generic now and the route-level pages handle their own fallbacks
  // when they can (e.g. /producer/[id] tries the local DB before
  // calling notFound()).
  return (
    <div className="py-20 text-center">
      <h1 className="mb-2 text-2xl font-bold">{t.common.pageNotFound}</h1>
      <p className="mb-4 text-sm text-muted">{t.common.pageNotFoundHint}</p>
      <Link href="/" className="btn mt-4">
        <ArrowLeft className="h-4 w-4" /> {t.nav.library}
      </Link>
    </div>
  );
}
