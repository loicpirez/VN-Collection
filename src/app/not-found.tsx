import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getDict } from '@/lib/i18n/server';

export default async function NotFound() {
  const t = await getDict();
  return (
    <div className="py-20 text-center">
      <h1 className="mb-2 text-2xl font-bold">{t.detail.notFoundTitle}</h1>
      <Link href="/" className="btn mt-4">
        <ArrowLeft className="h-4 w-4" /> {t.nav.library}
      </Link>
    </div>
  );
}
