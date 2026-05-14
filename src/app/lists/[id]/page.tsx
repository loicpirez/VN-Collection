import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ListChecks, Pin } from 'lucide-react';
import {
  db,
  getUserList,
  listUserListItems,
  type UserListItem,
} from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { VnCard } from '@/components/VnCard';
import { ListMetaEditor } from '@/components/ListMetaEditor';
import { ListRemoveVn } from '@/components/ListRemoveVn';
import { ListAddVnForm } from '@/components/ListAddVnForm';
import type { Status } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface VnRow {
  id: string;
  title: string;
  alttitle: string | null;
  image_url: string | null;
  image_thumb: string | null;
  image_sexual: number | null;
  local_image: string | null;
  local_image_thumb: string | null;
  custom_cover: string | null;
  released: string | null;
  rating: number | null;
  user_rating: number | null;
  playtime_minutes: number | null;
  length_minutes: number | null;
  status: string | null;
  favorite: number | null;
  developers: string | null;
}

function loadCards(items: UserListItem[]): Map<string, VnRow> {
  if (items.length === 0) return new Map();
  const ids = items.map((i) => i.vn_id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT v.id, v.title, v.alttitle, v.image_url, v.image_thumb, v.image_sexual,
              v.local_image, v.local_image_thumb,
              c.custom_cover, v.released, v.rating,
              c.user_rating, c.playtime_minutes, v.length_minutes,
              c.status, c.favorite,
              v.developers
         FROM vn v
    LEFT JOIN collection c ON c.vn_id = v.id
        WHERE v.id IN (${placeholders})`,
    )
    .all(...ids) as VnRow[];
  return new Map(rows.map((r) => [r.id, r]));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const listId = Number(id);
  if (!Number.isFinite(listId) || listId <= 0) return {};
  const list = getUserList(listId);
  return list ? { title: list.name } : {};
}

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listId = Number(id);
  if (!Number.isFinite(listId) || listId <= 0) notFound();
  const list = getUserList(listId);
  if (!list) notFound();
  const t = await getDict();
  const items = listUserListItems(listId);
  const rows = loadCards(items);

  return (
    <div>
      <Link href="/lists" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.lists.backToLists}
      </Link>

      <header className="mb-6 overflow-hidden rounded-2xl border border-border bg-bg-card p-5">
        <div className="flex items-start gap-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: list.color ?? '#475569' }}
            aria-hidden
          >
            <ListChecks className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              {list.name}
              {!!list.pinned && <Pin className="h-4 w-4 text-accent" aria-hidden />}
            </h1>
            {list.description && <p className="mt-1 whitespace-pre-line text-sm text-muted">{list.description}</p>}
            <div className="mt-2 text-xs text-muted">
              {(items.length === 1 ? t.lists.vnCountSingular : t.lists.vnCount).replace('{n}', String(items.length))}
            </div>
          </div>
          <ListMetaEditor list={list} />
        </div>
      </header>

      <section className="mb-6 rounded-xl border border-border bg-bg-card p-4 sm:p-6">
        <ListAddVnForm listId={list.id} />
      </section>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-bg-card p-10 text-center text-sm text-muted">
          {t.lists.detailEmpty}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((it) => {
            const row = rows.get(it.vn_id);
            const developers = parseDevelopers(row?.developers ?? null);
            return (
              <div key={it.vn_id} className="group relative">
                <ListRemoveVn listId={list.id} vnId={it.vn_id} />
                {row ? (
                  <VnCard
                    data={{
                      id: row.id,
                      title: row.title,
                      alttitle: row.alttitle,
                      poster: row.image_url || row.image_thumb,
                      localPoster: row.local_image_thumb || row.local_image,
                      customCover: row.custom_cover,
                      sexual: row.image_sexual,
                      released: row.released,
                      rating: row.rating,
                      user_rating: row.user_rating,
                      playtime_minutes: row.playtime_minutes,
                      length_minutes: row.length_minutes,
                      status: (row.status as Status | null) ?? undefined,
                      favorite: !!row.favorite,
                      developers,
                    }}
                  />
                ) : (
                  <StubCard vnId={it.vn_id} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StubCard({ vnId }: { vnId: string }) {
  return (
    <Link
      href={`/vn/${vnId}`}
      className="group relative flex aspect-[2/3] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-bg-elev/30 p-4 text-center text-muted hover:border-accent hover:text-white"
    >
      <ListChecks className="h-6 w-6" aria-hidden />
      <span className="font-mono text-xs">{vnId}</span>
    </Link>
  );
}

function parseDevelopers(raw: string | null): { id?: string; name: string }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((d): d is { id?: string; name?: string } => typeof d === 'object' && d !== null)
      .map((d) => ({ id: typeof d.id === 'string' ? d.id : undefined, name: String(d.name ?? '') }))
      .filter((d) => d.name);
  } catch {
    return [];
  }
}
