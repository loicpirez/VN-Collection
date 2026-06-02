'use client';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Trash2, X } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import { VndbMarkup } from './VndbMarkup';
import { useT } from '@/lib/i18n/client';

import { readApiError } from '@/lib/api-error-read';
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
 * Personal synopsis override. When set, takes priority over VNDB / EGS - the
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
  const identityRef = useRef<string | null>(vnId);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);
  const current = (initial ?? '').trim();
  const hasCustom = current.length > 0;

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    identityRef.current = vnId;
    setText(initial ?? '');
    setEditing(false);
    setSaving(false);
    setShowSources(false);
    return () => {
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      mutationInFlightRef.current = false;
      identityRef.current = null;
    };
  }, [vnId, initial]);

  function beginMutation(): AbortController | null {
    if (mutationInFlightRef.current) return null;
    const controller = new AbortController();
    mutationInFlightRef.current = true;
    mutationAbortRef.current = controller;
    setSaving(true);
    return controller;
  }

  function ownsMutation(ownerVnId: string, controller: AbortController): boolean {
    return identityRef.current === ownerVnId && mutationAbortRef.current === controller && !controller.signal.aborted;
  }

  function finishMutation(ownerVnId: string, controller: AbortController) {
    if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller) return;
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    setSaving(false);
  }

  async function save() {
    const ownerVnId = vnId;
    const controller = beginMutation();
    if (!controller) return;
    try {
      const r = await fetch(`/api/collection/${ownerVnId}/custom-description`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() || null }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (!ownsMutation(ownerVnId, controller)) return;
      toast.success(t.toast.saved);
      setEditing(false);
      startTransition(() => router.refresh());
    } catch (e) {
      if (!ownsMutation(ownerVnId, controller)) return;
      toast.error((e as Error).message);
    } finally {
      finishMutation(ownerVnId, controller);
    }
  }

  async function clear() {
    const ownerVnId = vnId;
    const controller = beginMutation();
    if (!controller) return;
    const ok = await confirm({ message: t.customSynopsis.clearConfirm, tone: 'danger' });
    if (!ok || !ownsMutation(ownerVnId, controller)) {
      finishMutation(ownerVnId, controller);
      return;
    }
    try {
      const r = await fetch(`/api/collection/${ownerVnId}/custom-description`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: null }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (!ownsMutation(ownerVnId, controller)) return;
      setText('');
      setEditing(false);
      toast.success(t.toast.saved);
      startTransition(() => router.refresh());
    } catch (e) {
      if (!ownsMutation(ownerVnId, controller)) return;
      toast.error((e as Error).message);
    } finally {
      finishMutation(ownerVnId, controller);
    }
  }

  if (editing) {
    return (
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-muted">
            {label} / {t.customSynopsis.editing}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => { setText(initial ?? ''); setEditing(false); }}
              disabled={saving}
              className="btn btn-xs"
            >
              <X className="h-3 w-3" aria-hidden />
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="btn btn-xs btn-primary"
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
          aria-label={label}
          disabled={saving}
          className="w-full rounded-md border border-border bg-bg-elev/40 p-3 text-sm leading-relaxed text-white focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg"
        />
        <p className="mt-1 text-[10px] text-muted">
          {text.length} / 8000 / {t.customSynopsis.hint}
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
            disabled={saving}
            className="btn btn-xs"
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
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
          {label}
          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold text-accent">
            {t.customSynopsis.badge}
          </span>
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setShowSources((v) => !v)}
            className="btn btn-xs"
          >
            {showSources ? t.customSynopsis.hideSources : t.customSynopsis.showSources}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={saving}
            className="btn btn-xs"
          >
            <Pencil className="h-3 w-3" aria-hidden />
            {t.common.edit}
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={saving}
            className="btn btn-xs btn-danger"
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
        normalizeVndbHref - same contract as the VNDB description
        path, no plain-text bypass.
      */}
      <div className="whitespace-pre-wrap leading-relaxed text-white/85">
        <VndbMarkup text={current} spoilerLabel={t.spoiler.markupSummary} />
      </div>
      {showSources && (
        <div className="mt-4 rounded-md border border-border bg-bg-elev/20 p-3">
          {fallback}
        </div>
      )}
    </div>
  );
}
