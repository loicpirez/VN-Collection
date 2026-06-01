'use client';
import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, Check, ListPlus, Loader2, Plus, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { PortalPopover } from './PortalPopover';
import { useToast } from './ToastProvider';

import { readApiError } from '@/lib/api-error-read';
import {
  decodeCreatedOrganizerUserList,
  decodeOrganizerUserLists,
  type OrganizerUserList as UserList,
} from '@/lib/organizer-client-shape';

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
  const menuRef = useRef<HTMLDivElement | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const identityRef = useRef<string | null>(vnId);
  const membershipsRef = useRef<Set<number> | null>(null);
  const toggleInFlightRef = useRef(new Set<number>());
  const toggleAbortRefs = useRef(new Map<number, AbortController>());
  const createInFlightRef = useRef(false);
  const createAbortRef = useRef<AbortController | null>(null);
  const popoverId = useId();
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open || loading) return;
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitemcheckbox"]');
    first?.focus();
  }, [open, loading]);

  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]') ?? [],
    );
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  }
  const closePopover = useCallback(() => {
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
    setLoading(false);
    setOpen(false);
  }, []);

  async function load() {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const ownerVnId = vnId;
    setLoading(true);
    try {
      const [listResponse, membershipResponse] = await Promise.all([
        fetch('/api/lists', { cache: 'no-store', signal: controller.signal }),
        fetch(`/api/vn/${vnId}/lists`, { cache: 'no-store', signal: controller.signal }),
      ]);
      if (!listResponse.ok) throw new Error(await readApiError(listResponse, t.common.error));
      if (!membershipResponse.ok) throw new Error(await readApiError(membershipResponse, t.common.error));
      const lists = decodeOrganizerUserLists(await listResponse.json());
      const membershipLists = decodeOrganizerUserLists(await membershipResponse.json());
      if (!lists || !membershipLists) throw new Error(t.common.error);
      if (controller.signal.aborted || identityRef.current !== ownerVnId || loadAbortRef.current !== controller) return;
      setLists(lists);
      const set = new Set<number>(membershipLists.map((list) => list.id));
      membershipsRef.current = set;
      setMemberships(set);
      setMemberCount(set.size);
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return;
      if (identityRef.current !== ownerVnId || loadAbortRef.current !== controller) return;
      toast.error(error instanceof Error ? error.message : t.common.error);
    } finally {
      if (loadAbortRef.current === controller && identityRef.current === ownerVnId) {
        loadAbortRef.current = null;
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    identityRef.current = vnId;
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
    membershipsRef.current = null;
    for (const controller of toggleAbortRefs.current.values()) controller.abort();
    toggleAbortRefs.current.clear();
    toggleInFlightRef.current.clear();
    createAbortRef.current?.abort();
    createAbortRef.current = null;
    createInFlightRef.current = false;
    setOpen(false);
    setLists(null);
    setMemberships(null);
    setLoading(false);
    setFilter('');
    setNewName('');
    setCreating(false);
    setMemberCount(initialMemberCount ?? null);
    return () => {
      identityRef.current = null;
      loadAbortRef.current?.abort();
      membershipsRef.current = null;
      for (const controller of toggleAbortRefs.current.values()) controller.abort();
      toggleAbortRefs.current.clear();
      toggleInFlightRef.current.clear();
      createAbortRef.current?.abort();
      createAbortRef.current = null;
      createInFlightRef.current = false;
    };
  }, [vnId, initialMemberCount]);

  function toggleOpen(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      closePopover();
      return;
    }
    setOpen(true);
    if (lists == null) void load();
  }

  async function toggle(list: UserList) {
    const current = membershipsRef.current;
    if (!current || toggleInFlightRef.current.has(list.id)) return;
    toggleInFlightRef.current.add(list.id);
    const controller = new AbortController();
    toggleAbortRefs.current.get(list.id)?.abort();
    toggleAbortRefs.current.set(list.id, controller);
    const ownerVnId = vnId;
    const isMember = current.has(list.id);
    const next = new Set(current);
    if (isMember) next.delete(list.id);
    else next.add(list.id);
    membershipsRef.current = next;
    setMemberships(next);
    setMemberCount(next.size);
    try {
      const url = `/api/lists/${list.id}/items${isMember ? `?vn=${encodeURIComponent(vnId)}` : ''}`;
      const r = await fetch(url, {
        method: isMember ? 'DELETE' : 'POST',
        headers: isMember ? undefined : { 'Content-Type': 'application/json' },
        body: isMember ? undefined : JSON.stringify({ vn_id: vnId }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (identityRef.current !== ownerVnId || toggleAbortRefs.current.get(list.id) !== controller || controller.signal.aborted) return;
      toast.success(
        (isMember ? t.lists.removedFrom : t.lists.addedTo).replace('{name}', list.name),
      );
      startTransition(() => router.refresh());
    } catch (e) {
      if (identityRef.current === ownerVnId && toggleAbortRefs.current.get(list.id) === controller && !controller.signal.aborted) {
        const live = membershipsRef.current;
        if (live) {
          const rollback = new Set(live);
          if (isMember) rollback.add(list.id);
          else rollback.delete(list.id);
          membershipsRef.current = rollback;
          setMemberships(rollback);
          setMemberCount(rollback.size);
        }
        toast.error((e as Error).message);
      }
    } finally {
      if (identityRef.current === ownerVnId && toggleAbortRefs.current.get(list.id) === controller) {
        toggleAbortRefs.current.delete(list.id);
        toggleInFlightRef.current.delete(list.id);
      }
    }
  }

  async function createAndAdd() {
    const trimmed = newName.trim();
    if (!trimmed || createInFlightRef.current) return;
    createInFlightRef.current = true;
    const controller = new AbortController();
    createAbortRef.current?.abort();
    createAbortRef.current = controller;
    const ownerVnId = vnId;
    setCreating(true);
    try {
      const r = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const list = decodeCreatedOrganizerUserList(await r.json());
      if (!list) throw new Error(t.common.error);
      if (identityRef.current !== ownerVnId || createAbortRef.current !== controller || controller.signal.aborted) return;
      setLists((cur) => (cur ? [list, ...cur] : [list]));
      setNewName('');
      await toggle(list);
    } catch (e) {
      if (identityRef.current === ownerVnId && createAbortRef.current === controller && !controller.signal.aborted) toast.error((e as Error).message);
    } finally {
      if (identityRef.current === ownerVnId && createAbortRef.current === controller) {
        createAbortRef.current = null;
        createInFlightRef.current = false;
        setCreating(false);
      }
    }
  }

  const filtered = lists?.filter((l) => l.name.toLowerCase().includes(filter.trim().toLowerCase())) ?? [];

  const hasMembership = (memberCount ?? 0) > 0;
  const triggerClass =
    variant === 'inline'
      ? `inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-border bg-bg-elev/40 px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent hover:text-white sm:h-9 sm:min-h-0`
      : `tap-target absolute right-2 top-11 z-10 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[10px] font-bold uppercase tracking-wider shadow-card backdrop-blur transition-opacity hover:bg-bg-card ${
          hasMembership
            ? 'bg-accent text-bg !opacity-100'
            : `bg-bg-card/85 text-white can-hover:md:opacity-0 can-hover:md:group-hover:opacity-100 md:group-focus-within:opacity-100${open ? ' !opacity-100' : ''}`
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
          ref={menuRef}
          role="menu"
          aria-label={t.lists.addToList}
          onKeyDown={handleMenuKeyDown}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted">{t.lists.addToList}</span>
            <button
              type="button"
              onClick={closePopover}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-1 text-muted hover:text-white sm:min-h-0 sm:min-w-0"
              aria-label={t.common.close}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {loading && (
            <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {t.common.loading}
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
                  aria-label={t.lists.filterPlaceholder}
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
                        disabled={toggleInFlightRef.current.has(l.id) || creating}
                        className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-elev sm:min-h-0"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            checked ? 'border-accent bg-accent text-bg' : 'border-border bg-bg-elev'
                          }`}
                          aria-hidden
                        >
                          {checked && <Check className="h-3 w-3" aria-hidden />}
                        </span>
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: l.color ?? '#475569' }}
                          aria-hidden
                        />
                        <span title={l.name} className="line-clamp-1 flex-1 text-xs">{l.name}</span>
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
                  disabled={creating}
                  className="input flex-1 text-xs"
                />
                <button
                  type="button"
                  onClick={createAndAdd}
                  disabled={creating || newName.trim().length === 0}
                  className="btn btn-primary text-xs"
                  aria-label={t.lists.create}
                >
                  {creating ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Plus className="h-3 w-3" aria-hidden />}
                </button>
              </div>
            </>
          )}
        </div>
      </PortalPopover>
    </div>
  );
}
