'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MoreVertical, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';

import { readApiError } from '@/lib/api-error-read';
interface List {
  id: number;
  name: string;
  pinned: number;
}

export function ListCardActions({ list }: { list: List }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const { confirm, prompt } = useConfirm();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const identityRef = useRef<number | null>(list.id);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    identityRef.current = list.id;
    setOpen(false);
    setBusy(false);
    return () => {
      identityRef.current = null;
      mutationInFlightRef.current = false;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
    };
  }, [list.id]);

  function startMutation() {
    if (mutationInFlightRef.current) return null;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    mutationInFlightRef.current = true;
    setBusy(true);
    return controller;
  }

  function ownsMutation(ownerListId: number, controller: AbortController) {
    return identityRef.current === ownerListId && mutationAbortRef.current === controller && !controller.signal.aborted;
  }

  function finishMutation(ownerListId: number, controller: AbortController) {
    if (mutationAbortRef.current !== controller) return;
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    if (identityRef.current === ownerListId) {
      setBusy(false);
      setOpen(false);
    }
  }

  async function patch(payload: Record<string, unknown>, ownerListId = list.id, controller = startMutation()) {
    if (!controller) return;
    try {
      const r = await fetch(`/api/lists/${ownerListId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (!ownsMutation(ownerListId, controller)) return;
      startTransition(() => router.refresh());
    } catch (e) {
      if (!ownsMutation(ownerListId, controller)) return;
      toast.error((e as Error).message);
    } finally {
      finishMutation(ownerListId, controller);
    }
  }

  async function rename() {
    const ownerListId = list.id;
    const controller = startMutation();
    if (!controller) return;
    try {
      const next = await prompt({
        title: t.lists.rename,
        initial: list.name,
        validate: (v) => (v.trim() ? null : t.lists.renameRequired),
      });
      if (!ownsMutation(ownerListId, controller)) return;
      if (next === null || !next || next === list.name) return;
      await patch({ name: next }, ownerListId, controller);
    } finally {
      finishMutation(ownerListId, controller);
    }
  }

  async function togglePin() {
    await patch({ pinned: !list.pinned });
  }

  async function destroy() {
    const ownerListId = list.id;
    const controller = startMutation();
    if (!controller) return;
    try {
      const ok = await confirm({ message: t.lists.deleteConfirm, tone: 'danger' });
      if (!ownsMutation(ownerListId, controller) || !ok) return;
      const r = await fetch(`/api/lists/${ownerListId}`, { method: 'DELETE', signal: controller.signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (!ownsMutation(ownerListId, controller)) return;
      startTransition(() => router.refresh());
    } catch (e) {
      if (!ownsMutation(ownerListId, controller)) return;
      toast.error((e as Error).message);
    } finally {
      finishMutation(ownerListId, controller);
    }
  }

  const menuId = `list-${list.id}-menu`;
  const triggerId = `list-${list.id}-trigger`;

  return (
    <div className="absolute right-2 top-2">
      <button
        id={triggerId}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted transition-opacity hover:bg-bg-elev hover:text-white focus:opacity-100 can-hover:md:opacity-0 can-hover:md:group-hover:opacity-100 sm:h-9 sm:w-9 sm:min-h-0 sm:min-w-0"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t.nav.openMenu}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MoreVertical className="h-4 w-4" aria-hidden />}
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-full z-20 mt-1 w-44 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-bg-card p-1 text-sm shadow-card"
          role="menu"
          aria-labelledby={triggerId}
          onKeyDown={(e) => {
            const items = Array.from(
              (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')
            );
            const idx = items.indexOf(document.activeElement as HTMLElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); items[(idx + 1) % items.length]?.focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); items[(idx - 1 + items.length) % items.length]?.focus(); }
            else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
            else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
            else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
          }}
        >
          <ActionRow icon={list.pinned ? PinOff : Pin} label={list.pinned ? t.lists.unpin : t.lists.pin} onClick={togglePin} disabled={busy} />
          <ActionRow icon={Pencil} label={t.lists.rename} onClick={rename} disabled={busy} />
          <ActionRow
            icon={Trash2}
            label={t.lists.delete}
            danger
            onClick={destroy}
            disabled={busy}
          />
        </div>
      )}
    </div>
  );
}

function ActionRow({
  icon: Icon,
  label,
  onClick,
  danger = false,
  disabled = false,
}: {
  icon: typeof Pin;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[44px] w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted hover:bg-bg-elev sm:min-h-0 ${
        danger ? 'hover:text-status-dropped' : 'hover:text-white'
      }`}
      role="menuitem"
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
