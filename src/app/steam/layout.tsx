import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict();
  return { title: t.settings.steamTitle };
}

export default function SteamLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
