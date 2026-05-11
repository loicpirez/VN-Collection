'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';

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

  async function set(next: Choice) {
    if (next === optimistic || pending) return;
    setOptimistic(next);
    try {
      const r = await fetch(`/api/collection/${vnId}/source-pref`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: next }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      startTransition(() => router.refresh());
    } catch (e) {
      setOptimistic(current);
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/30 p-0.5">
      {pending && <Loader2 className="ml-1 h-3 w-3 animate-spin text-muted" aria-hidden />}
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
            disabled={disabled}
            className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider transition-colors ${
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
