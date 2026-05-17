'use client';
import { useCallback, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, Check, ListPlus, Loader2, Plus, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { PortalPopover } from './PortalPopover';
import { useToast } from './ToastProvider';

interface UserList {
  id: number;
  name: string;
  color: string | null;
  pinned: number;
}

interface Props {
  vnId: string;
  /** Optional positioning: small overlay (default) or inline pill on detail pages. */
  variant?: 'overlay' | 'inline';
  /** When set, renders a count chip with the current membership count even before the popover is opened. */
  initialMemberCount?: number;
}

/**
 * Hover/tap-friendly button that opens a popover for adding/removing the
 * current VN from any number of user-curated lists. Lazy: both the list
 * registry and the per-VN membership are fetched only when the user
 * opens the popover, so cards stay cheap. Optimistic updates on toggle.
 */
export function ListsPickerButton({ vnId, variant = 'overlay', initialMemberCount }: Props) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<UserList[] | null>(null);
  const [memberships, setMemberships] = useState<Set<number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('');
  const [memberCount, setMemberCount] = useState<number | null>(initialMemberCount ?? null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverId = useId();
  const [, startTransition] = useTransition();
  const closePopover = useCallback(() => setOpen(false), []);

  async function load() {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch('/api/lists').then((r) => r.json()),
        fetch(`/api/vn/${vnId}/lists`).then((r) => r.json()),
      ]);
      setLists((r1.lists as UserList[]) ?? []);
      const set = new Set<number>((r2.lists as UserList[] | undefined)?.map((l) => l.id) ?? []);
      setMemberships(set);
      setMemberCount(set.size);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function toggleOpen(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (lists == null) void load();
  }

  async function toggle(list: UserList) {
    if (!memberships) return;
    const isMember = memberships.has(list.id);
    const next = new Set(memberships);
    if (isMember) next.delete(list.id);
    else next.add(list.id);
    setMemberships(next);
    setMemberCount(next.size);
    try {
      const url = `/api/lists/${list.id}/items${isMember ? `?vn=${encodeURIComponent(vnId)}` : ''}`;
      const r = await fetch(url, {
        method: isMember ? 'DELETE' : 'POST',
        headers: isMember ? undefined : { 'Content-Type': 'application/json' },
        body: isMember ? undefined : JSON.stringify({ vn_id: vnId }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(
        (isMember ? t.lists.removedFrom : t.lists.addedTo).replace('{name}', list.name),
      );
      startTransition(() => router.refresh());
    } catch (e) {
      setMemberships(memberships);
      setMemberCount(memberships.size);
      toast.error((e as Error).message);
    }
  }

  async function createAndAdd() {
    const trimmed = newName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const r = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const { list } = (await r.json()) as { list: UserList };
      setLists((cur) => (cur ? [list, ...cur] : [list]));
      setNewName('');
      await toggle(list);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const filtered = lists?.filter((l) => l.name.toLowerCase().includes(filter.trim().toLowerCase())) ?? [];

  const hasMembership = (memberCount ?? 0) > 0;
  const triggerClass =
    variant === 'inline'
      ? `inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-xs font-semibold text-muted hover:border-accent hover:text-white`
      : `absolute right-2 top-11 z-30 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[10px] font-bold uppercase tracking-wider shadow-card backdrop-blur transition-opacity hover:bg-bg-card ${
          hasMembership
            ? 'bg-accent text-bg !opacity-100'
            : 'bg-bg-card/85 text-white md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'
        }`;

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        className={triggerClass}
        aria-label={t.lists.addToListAria}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={popoverId}
        title={t.lists.addToListAria}
      >
        {variant === 'inline' ? <ListPlus className="h-3.5 w-3.5" aria-hidden /> : <Bookmark className="h-3.5 w-3.5" aria-hidden />}
        {variant === 'inline' ? t.lists.cardChip : null}
        {(memberCount ?? 0) > 0 && (
          <span className={variant === 'inline' ? 'rounded bg-accent px-1 text-bg' : 'rounded bg-accent px-1 text-bg'}>
            {memberCount}
          </span>
        )}
      </button>
      <PortalPopover
        open={open}
        onClose={closePopover}
        triggerRef={triggerRef}
        label={t.lists.addToList}
        panelId={popoverId}
        panelClassName="w-64 rounded-lg border border-border bg-bg-card p-2 text-sm shadow-card"
      >
        <div
          role="menu"
          aria-label={t.lists.addToList}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted">{t.lists.addToList}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="tap-target-tight rounded-md p-1 text-muted hover:text-white"
              aria-label={t.common.close}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {loading && (
            <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted">
              <Loader2 className="h-3 w-3 animate-spin" /> {t.common.loading}
            </div>
          )}
          {!loading && lists && (
            <>
              {lists.length > 5 && (
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t.lists.newListPlaceholder}
                  aria-label={t.lists.newListPlaceholder}
                  className="input mb-2 w-full text-xs"
                />
              )}
              {filtered.length === 0 && lists.length > 0 && (
                <p className="px-1 py-1 text-[11px] text-muted">{t.lists.noLists}</p>
              )}
              {lists.length === 0 && (
                <p className="px-1 py-1 text-[11px] text-muted">{t.lists.noLists}</p>
              )}
              <ul className="mb-2 max-h-56 overflow-y-auto">
                {filtered.map((l) => {
                  const checked = memberships?.has(l.id) ?? false;
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={checked}
                        onClick={() => toggle(l)}
                        className="tap-target flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-elev"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            checked ? 'border-accent bg-accent text-bg' : 'border-border bg-bg-elev'
                          }`}
                          aria-hidden
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: l.color ?? '#475569' }}
                          aria-hidden
                        />
                        <span className="line-clamp-1 flex-1 text-xs">{l.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center gap-1 border-t border-border pt-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createAndAdd();
                  }}
                  placeholder={t.lists.newListPlaceholder}
                  aria-label={t.lists.create}
                  className="input flex-1 text-xs"
                />
                <button
                  type="button"
                  onClick={createAndAdd}
                  disabled={creating || newName.trim().length === 0}
                  className="btn btn-primary text-xs"
                  aria-label={t.lists.create}
                >
                  {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                </button>
              </div>
            </>
          )}
        </div>
      </PortalPopover>
    </div>
  );
}
