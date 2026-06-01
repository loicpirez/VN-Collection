import type { Metadata } from 'next';
import { StockLookupClient } from '@/components/StockLookupClient';
import { getDict } from '@/lib/i18n/server';
import { isValidVnId, normalizeVnId } from '@/lib/vn-id-shape';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict();
  return { title: t.stock.pageTitle };
}

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const raw = params.vn;
  const vn = Array.isArray(raw) ? raw[0] : raw;
  const initialVnId = isValidVnId(vn) ? normalizeVnId(vn) : null;
  return <StockLookupClient initialVnId={initialVnId} />;
}
