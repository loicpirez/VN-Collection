'use client';
import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Trash2, X } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import { VndbMarkup } from './VndbMarkup';
import { useT } from '@/lib/i18n/client';

interface Props {
  vnId: string;
  label: string;
  initial: string | null;
  /**
   * Rendered when the user has no custom synopsis. Typically a FieldCompare
   * showing VNDB / EGS side by side.
   */
  fallback: ReactNode;
}

/**
 * Personal synopsis override. When set, takes priority over VNDB / EGS — the
 * user reads their own copy by default. A "Show sources" toggle reveals the
 * fallback (FieldCompare) so the original wording is still one click away.
 */
export function CustomSynopsis({ vnId, label, initial, fallback }: Props) {
  const t = useT();
  const toast = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();
  const [text, setText] = useState(initial ?? '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [, startTransition] = useTransition();
  const current = (initial ?? '').trim();
  const hasCustom = current.length > 0;

  async function save() {
    setSaving(true);
    try {
      const r = await fetch(`/api/collection/${vnId}/custom-description`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() || null }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.saved);
      setEditing(false);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    const ok = await confirm({ message: t.customSynopsis.clearConfirm, tone: 'danger' });
    if (!ok) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/collection/${vnId}/custom-description`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: null }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      setText('');
      setEditing(false);
      toast.success(t.toast.saved);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted">
            {label} · {t.customSynopsis.editing}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => { setText(initial ?? ''); setEditing(false); }}
              disabled={saving}
              className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
            >
              <X className="mr-1 inline-block h-3 w-3" aria-hidden />
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-bold text-bg disabled:opacity-50"
            >
              {saving ? <Loader2 className="mr-1 inline-block h-3 w-3 animate-spin" aria-hidden /> : null}
              {t.common.save}
            </button>
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          maxLength={8000}
          placeholder={t.customSynopsis.placeholder}
          className="w-full rounded-md border border-border bg-bg-elev/40 p-3 text-sm leading-relaxed text-white focus:border-accent focus:outline-none"
        />
        <p className="mt-1 text-[10px] text-muted">
          {text.length} / 8000 · {t.customSynopsis.hint}
        </p>
      </div>
    );
  }

  if (!hasCustom) {
    return (
      <div>
        {fallback}
        <div className="mt-3 text-right">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
          >
            <Pencil className="h-3 w-3" aria-hidden />
            {t.customSynopsis.add}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted">
          {label}
          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold text-accent">
            {t.customSynopsis.badge}
          </span>
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setShowSources((v) => !v)}
            className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
          >
            {showSources ? t.customSynopsis.hideSources : t.customSynopsis.showSources}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
          >
            <Pencil className="mr-1 inline-block h-3 w-3" aria-hidden />
            {t.common.edit}
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={saving}
            className="rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px] text-muted hover:border-status-dropped hover:text-status-dropped disabled:opacity-50"
          >
            <Trash2 className="mr-1 inline-block h-3 w-3" aria-hidden />
            {t.common.delete}
          </button>
        </div>
      </div>
      {/*
        User-authored synopsis goes through VndbMarkup so BBCode
        (`[url=…]`, `[spoiler]`) plus inline VNDB refs (`vNNN`,
        `cNNN`, etc.) become canonical internal links via
        normalizeVndbHref — same contract as the VNDB description
        path, no plain-text bypass.
      */}
      <div className="whitespace-pre-wrap leading-relaxed text-white/85">
        <VndbMarkup text={current} />
      </div>
      {showSources && (
        <div className="mt-4 rounded-md border border-border bg-bg-elev/20 p-3">
          {fallback}
        </div>
      )}
    </div>
  );
}
