import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getDict } from '@/lib/i18n/server';
import { KobeClient } from '@/components/KobeClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  if (!process.env.ALICE_KOBE_ENABLED) return {};
  const t = await getDict();
  return { title: t.nav.alicesoft_kobe };
}

export default function KobePage() {
  if (!process.env.ALICE_KOBE_ENABLED) notFound();
  return <KobeClient />;
}
