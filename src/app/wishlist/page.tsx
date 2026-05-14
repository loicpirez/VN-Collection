import type { Metadata } from 'next';
import { getDict } from '@/lib/i18n/server';
import { WishlistClient } from '@/components/WishlistClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.nav.wishlist };
}

export default function WishlistPage() {
  return <WishlistClient />;
}
