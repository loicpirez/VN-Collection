import type { Metadata } from 'next';
import { StockLookupClient } from '@/components/StockLookupClient';
import { getDict } from '@/lib/i18n/server';
import { parseStockVnQuery, type PageQueryRecord } from '@/lib/page-query';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict();
  return { title: t.stock.pageTitle };
}

export default async function StockPage({ searchParams }: { searchParams: Promise<PageQueryRecord> }) {
  const params = await searchParams;
  return <StockLookupClient initialVnId={parseStockVnQuery(params)} />;
}
