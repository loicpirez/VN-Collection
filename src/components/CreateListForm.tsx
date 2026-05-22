'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

import { readApiError } from '@/lib/api-error-read';
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

export function CreateListForm() {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          description: description.trim() || null,
          color,
        }),
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      toast.success(t.lists.created);
      setName('');
      setDescription('');
      setColor(null);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t.lists.createPrompt}
        aria-label={t.lists.createPrompt}
        maxLength={120}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        className="input min-w-[180px] flex-1"
      />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t.lists.createHint}
        aria-label={t.lists.createHint}
        maxLength={400}
        className="input min-w-[180px] flex-[2]"
      />
      <div className="flex items-center gap-1 rounded-md border border-border bg-bg-elev/30 p-1">
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
      <button
        type="button"
        onClick={submit}
        disabled={busy || name.trim().length === 0}
        className="btn btn-primary"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {t.lists.create}
      </button>
    </div>
  );
}
