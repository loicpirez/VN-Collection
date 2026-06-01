'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';

import { readApiError } from '@/lib/api-error-read';
type Choice = 'auto' | 'vndb' | 'egs';
type Field = 'description' | 'image' | 'brand' | 'title' | 'rating' | 'playtime';

interface Props {
  vnId: string;
  field: Field;
  current: Choice;
  /** True if VNDB actually has a value for this field. Used to dim impossible options. */
  vndbAvailable: boolean;
  egsAvailable: boolean;
}

const ORDER: Choice[] = ['auto', 'vndb', 'egs'];

/**
 * Three-way segmented toggle (auto / VNDB / EGS) shown next to a field.
 * Persists the choice via PATCH /api/collection/[id]/source-pref, then
 * `router.refresh()` re-runs the server render with the new pref applied.
 */
export function SourceSwitcher({ vnId, field, current, vndbAvailable, egsAvailable }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<Choice>(current);
  const [saving, setSaving] = useState(false);
  const identity = `${vnId}|${field}`;
  const identityRef = useRef<string | null>(identity);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    identityRef.current = identity;
    setOptimistic(current);
    setSaving(false);
    return () => {
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      mutationInFlightRef.current = false;
      identityRef.current = null;
    };
  }, [identity, current]);

  async function set(next: Choice) {
    if (next === optimistic || mutationInFlightRef.current) return;
    const ownerIdentity = identity;
    const ownerVnId = vnId;
    const previous = optimistic;
    const controller = new AbortController();
    mutationInFlightRef.current = true;
    mutationAbortRef.current = controller;
    setSaving(true);
    setOptimistic(next);
    try {
      const r = await fetch(`/api/collection/${ownerVnId}/source-pref`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: next }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (identityRef.current !== ownerIdentity || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      startTransition(() => router.refresh());
    } catch (e) {
      if (identityRef.current !== ownerIdentity || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setOptimistic(previous);
      toast.error((e as Error).message);
    } finally {
      if (identityRef.current === ownerIdentity && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        setSaving(false);
      }
    }
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/30 p-0.5">
      {(saving || pending) && <Loader2 className="ml-1 h-3 w-3 animate-spin text-muted" aria-hidden />}
      {ORDER.map((c) => {
        const disabled =
          (c === 'vndb' && !vndbAvailable && optimistic !== 'vndb') ||
          (c === 'egs' && !egsAvailable && optimistic !== 'egs');
        const active = optimistic === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => set(c)}
            disabled={disabled || saving}
            aria-pressed={active}
            className={`min-h-[44px] rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider transition-colors sm:min-h-0 ${
              active
                ? 'bg-accent text-bg font-bold'
                : disabled
                  ? 'text-muted/40 cursor-not-allowed'
                  : 'text-muted hover:text-white'
            }`}
            title={t.sourcePref[c]}
          >
            {c === 'auto' ? t.sourcePref.auto : c === 'vndb' ? 'VNDB' : 'EGS'}
          </button>
        );
      })}
    </div>
  );
}
