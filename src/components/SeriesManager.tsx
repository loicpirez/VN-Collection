'use client';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bookmark, Plus, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import type { SeriesRow } from '@/lib/types';

export function SeriesManager({ initial }: { initial: SeriesRow[] }) {
  const t = useT();
  const router = useRouter();
  const [items, setItems] = useState<SeriesRow[]>(initial);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setItems(initial), [initial]);

  async function create() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const res = await fetch('/api/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, description: description.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t.common.error);
      }
      const data = await res.json();
      setItems((s) => [...s, data.series].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
      setDescription('');
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: number) {
    if (!confirm(t.series.deleteConfirm)) return;
    const res = await fetch(`/api/series/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError(t.common.error);
      return;
    }
    setItems((s) => s.filter((x) => x.id !== id));
    startTransition(() => router.refresh());
  }

  return (
    <div>
      <header className="mb-6 flex items-center gap-3">
        <Bookmark className="h-7 w-7 text-accent" aria-hidden />
        <h1 className="text-2xl font-bold">{t.series.pageTitle}</h1>
      </header>

      <div className="mb-8 rounded-2xl border border-border bg-bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <input
            className="input"
            placeholder={t.series.newName}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input"
            placeholder={t.series.newDescription}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button className="btn btn-primary" onClick={create} disabled={!name.trim() || pending}>
            <Plus className="h-4 w-4" /> {t.series.create}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-status-dropped">{error}</p>}
      </div>

      {items.length === 0 ? (
        <div className="py-16 text-center text-muted">{t.series.empty}</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => (
            <div key={s.id} className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-card p-4 hover:border-accent">
              <Link href={`/series/${s.id}`} className="min-w-0 flex-1">
                <div className="font-semibold">{s.name}</div>
                {s.description && <div className="line-clamp-2 text-xs text-muted">{s.description}</div>}
              </Link>
              <button
                className="btn btn-danger opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => remove(s.id)}
                aria-label={t.series.delete}
                title={t.series.delete}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
