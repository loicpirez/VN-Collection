import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getDict } from '@/lib/i18n/server';
import { AliceNetClient } from '@/components/AliceNetClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  if (!process.env.ALICENET_ENABLED) return {};
  const t = await getDict();
  return { title: t.nav.alicenet };
}

export default function AliceNetPage() {
  if (!process.env.ALICENET_ENABLED) notFound();
  return <AliceNetClient />;
}
