'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Pencil, Pin, PinOff, Trash2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';

import { readApiError } from '@/lib/api-error-read';
interface List {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  pinned: number;
}

const PRESET_COLORS: { hex: string; name: string }[] = [
  { hex: '#ef4444', name: 'Red' },
  { hex: '#f97316', name: 'Orange' },
  { hex: '#f59e0b', name: 'Amber' },
  { hex: '#22c55e', name: 'Green' },
  { hex: '#06b6d4', name: 'Cyan' },
  { hex: '#3b82f6', name: 'Blue' },
  { hex: '#8b5cf6', name: 'Violet' },
  { hex: '#ec4899', name: 'Pink' },
];

export function ListMetaEditor({ list }: { list: List }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? '');
  const [color, setColor] = useState<string | null>(list.color);
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
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (busy) return;
    await patch({
      name: name.trim(),
      description: description.trim() || null,
      color,
    });
    setOpen(false);
  }

  async function destroy() {
    const ok = await confirm({ message: t.lists.deleteConfirm, tone: 'danger' });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/lists/${list.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      startTransition(() => router.push('/lists'));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => patch({ pinned: !list.pinned })}
          className="rounded-md p-2 text-muted hover:bg-bg-elev hover:text-white"
          aria-label={list.pinned ? t.lists.unpin : t.lists.pin}
          title={list.pinned ? t.lists.unpin : t.lists.pin}
        >
          {list.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="tap-target rounded-md p-2 text-muted hover:bg-bg-elev hover:text-white"
          aria-label={t.lists.rename}
          title={t.lists.rename}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={destroy}
          disabled={busy}
          className="tap-target rounded-md p-2 text-muted hover:bg-bg-elev hover:text-status-dropped"
          aria-label={t.lists.delete}
          title={t.lists.delete}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md space-y-2 rounded-lg border border-border bg-bg-elev/30 p-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={120}
        aria-label={t.series.nameField}
        placeholder={t.series.nameField}
        className="input w-full text-sm"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={400}
        rows={2}
        aria-label={t.series.descriptionField}
        placeholder={t.series.descriptionField}
        className="input w-full resize-y text-sm"
      />
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => setColor(null)}
          aria-label={t.lists.noColor}
          className={`tap-target-tight h-6 w-6 rounded ${color == null ? 'ring-2 ring-accent' : 'opacity-60 hover:opacity-100'}`}
          style={{ background: 'linear-gradient(135deg, #475569 50%, #1e293b 50%)' }}
        />
        {PRESET_COLORS.map(({ hex, name }) => (
          <button
            key={hex}
            type="button"
            onClick={() => setColor(hex)}
            aria-label={name}
            className={`tap-target-tight h-6 w-6 rounded ${color === hex ? 'ring-2 ring-white' : 'opacity-60 hover:opacity-100'}`}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="btn text-xs">
          <X className="h-3 w-3" /> {t.common.cancel}
        </button>
        <button type="button" onClick={save} disabled={busy || name.trim().length === 0} className="btn btn-primary text-xs">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Check className="h-3 w-3" />}
          {t.common.save}
        </button>
      </div>
    </div>
  );
}
