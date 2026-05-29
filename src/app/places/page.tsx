import { getDict } from '@/lib/i18n/server';
import { PlaceBrowser } from '@/components/PlaceBrowser';

export async function generateMetadata() {
  const t = await getDict();
  return { title: `${t.places.title} — ${t.app.title}` };
}

export default async function PlacesPage() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PlaceBrowser />
    </main>
  );
}
