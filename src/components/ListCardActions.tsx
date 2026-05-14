'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MoreVertical, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

interface List {
  id: number;
  name: string;
  pinned: number;
}

export function ListCardActions({ list }: { list: List }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch(`/api/lists/${list.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  async function rename() {
    const next = prompt(t.lists.rename, list.name);
    if (!next || next.trim() === list.name) {
      setOpen(false);
      return;
    }
    await patch({ name: next.trim() });
  }

  async function togglePin() {
    await patch({ pinned: !list.pinned });
  }

  async function destroy() {
    if (!confirm(t.lists.deleteConfirm)) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/lists/${list.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div className="absolute right-2 top-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md p-1 text-muted opacity-0 transition-opacity hover:bg-bg-elev hover:text-white focus:opacity-100 group-hover:opacity-100"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-bg-card p-1 text-sm shadow-card"
          role="menu"
        >
          <ActionRow icon={list.pinned ? PinOff : Pin} label={list.pinned ? t.lists.unpin : t.lists.pin} onClick={togglePin} />
          <ActionRow icon={Pencil} label={t.lists.rename} onClick={rename} />
          <ActionRow
            icon={Trash2}
            label={t.lists.delete}
            danger
            onClick={destroy}
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
}: {
  icon: typeof Pin;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted hover:bg-bg-elev ${
        danger ? 'hover:text-status-dropped' : 'hover:text-white'
      }`}
      role="menuitem"
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
