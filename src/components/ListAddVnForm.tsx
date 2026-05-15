'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

const VN_ID = /^v\d+$/i;
const EGS_ID = /^egs_\d+$/i;

export function ListAddVnForm({ listId }: { listId: number }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function submit() {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || busy) return;
    if (!VN_ID.test(trimmed) && !EGS_ID.test(trimmed)) {
      toast.error(t.series.invalidListVnId);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/lists/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vn_id: trimmed }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      setValue('');
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="v123 / egs_456"
        aria-label={t.series.addVn}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        className="input min-w-[180px] flex-1"
      />
      <button
        type="button"
        onClick={submit}
        disabled={busy || value.trim().length === 0}
        className="btn btn-primary"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {t.series.addVn}
      </button>
    </div>
  );
}
