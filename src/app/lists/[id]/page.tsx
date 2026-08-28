import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ListChecks, Pin } from 'lucide-react';
import { getCollectionListRepository } from '@/lib/db/repositories/collection-list';
import { getUserListRepository } from '@/lib/db/repositories/user-list';
import { getDict } from '@/lib/i18n/server';
import { VnCard } from '@/components/VnCard';
import { toCardData } from '@/components/cardData';
import { ListMetaEditor } from '@/components/ListMetaEditor';
import { ListRemoveVn } from '@/components/ListRemoveVn';
import { ListAddVnForm } from '@/components/ListAddVnForm';
import { CardDensitySlider } from '@/components/CardDensitySlider';
import { DensityScopeProvider } from '@/components/DensityScopeProvider';
import { PaginatedGrid } from '@/components/PaginatedGrid';
import { ListReorderGrid, StubCard, type ListReorderItem } from '@/components/ListReorderGrid';

export const dynamic = 'force-dynamic';
const LIST_REORDER_MAX = 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const listId = Number(id);
  if (!Number.isFinite(listId) || listId <= 0) return {};
  const list = await getUserListRepository().get(listId);
  return list ? { title: list.name } : {};
}

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listId = Number(id);
  if (!Number.isFinite(listId) || listId <= 0) notFound();
  const repository = getUserListRepository();
  const list = await repository.get(listId);
  if (!list) notFound();
  const t = await getDict();
  const items = await repository.items(listId);
  const collectionRepository = getCollectionListRepository();
  const [cards, queueIds, listCounts] = await Promise.all([
    collectionRepository.listCards({ vnIds: items.map((item) => item.vn_id) }),
    collectionRepository.readingQueueIds(),
    collectionRepository.listMembershipCounts(),
  ]);
  const rows = new Map(cards.map((card) => [card.id, card]));
  const reorderItems: ListReorderItem[] = items.map((it) => {
    const row = rows.get(it.vn_id);
    if (!row) return { vn_id: it.vn_id, card: null };
    return {
      vn_id: it.vn_id,
      card: toCardData({
        ...row,
        list_count: listCounts.get(it.vn_id) ?? 0,
        in_reading_queue: queueIds.has(it.vn_id),
      }),
    };
  });
  const gridClassName = 'grid items-stretch gap-5';
  const gridStyle = {
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))',
  };

  return (
    <DensityScopeProvider scope="lists">
      <Link href="/lists" className="mb-4 inline-flex min-h-[44px] items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t.lists.backToLists}
      </Link>

      <header className="mb-6 overflow-hidden rounded-2xl border border-border bg-bg-card p-5">
        <div className="flex items-start gap-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ backgroundColor: list.color ?? '#475569' }}
            aria-hidden
          >
            <ListChecks className="h-6 w-6" aria-hidden />
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
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Density slider - controls the VN grid below. */}
            <CardDensitySlider scope="lists" />
            <ListMetaEditor list={list} />
          </div>
        </div>
      </header>

      <section className="mb-6 rounded-xl border border-border bg-bg-card p-4 sm:p-6">
        <ListAddVnForm listId={list.id} />
      </section>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-bg-card p-10 text-center text-sm text-muted">
          {t.lists.detailEmpty}
        </div>
      ) : reorderItems.length <= LIST_REORDER_MAX ? (
        <ListReorderGrid
          listId={list.id}
          items={reorderItems}
          className={gridClassName}
          style={gridStyle}
          reorderHint={t.lists.reorderHint}
          reorderKeyboardHint={t.lists.reorderKeyboardHint}
          errorLabel={t.common.error}
        />
      ) : (
        <PaginatedGrid ariaLabel={list.name} resetKey={`list:${list.id}`} className={gridClassName} style={gridStyle}>
          {reorderItems.map((it) => (
            <li key={it.vn_id} className="group relative flex min-h-0 min-w-0 flex-col items-stretch self-stretch">
              <ListRemoveVn listId={list.id} vnId={it.vn_id} />
              {it.card ? <VnCard data={it.card} /> : <StubCard vnId={it.vn_id} />}
            </li>
          ))}
        </PaginatedGrid>
      )}
    </DensityScopeProvider>
  );
}
