'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bookmark, Plus, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useConfirm } from './ConfirmDialog';
import { ErrorAlert } from './ErrorAlert';
import { readApiError } from '@/lib/api-error-read';
import type { SeriesRow } from '@/lib/types';
import { decodeCreatedSeriesRow } from '@/lib/organizer-client-shape';

export function SeriesManager({ initial }: { initial: SeriesRow[] }) {
  const t = useT();
  const { confirm } = useConfirm();
  const router = useRouter();
  const [items, setItems] = useState<SeriesRow[]>(initial);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const mutationAbortRef = useRef<AbortController | null>(null);

  useEffect(() => setItems(initial), [initial]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      busyRef.current = false;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
    };
  }, []);

  async function create() {
    if (busyRef.current) return;
    setError(null);
    const trimmed = name.trim();
    busyRef.current = true;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    setBusy('create');
    try {
      const res = await fetch('/api/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, description: description.trim() || null }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, t.common.error));
      }
      const series = decodeCreatedSeriesRow(await res.json());
      if (!series) throw new Error(t.common.error);
      if (!mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setItems((s) => [...s, series].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
      setDescription('');
      startTransition(() => router.refresh());
    } catch (e) {
      if (!mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setError((e as Error).message);
    } finally {
      if (mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        busyRef.current = false;
        setBusy(null);
      }
    }
  }

  async function remove(id: number) {
    if (busyRef.current) return;
    busyRef.current = true;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    setBusy(`remove-${id}`);
    const ok = await confirm({ message: t.series.deleteConfirm, tone: 'danger' });
    if (!ok || !mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) {
      if (mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        busyRef.current = false;
        setBusy(null);
      }
      return;
    }
    try {
      const res = await fetch(`/api/series/${id}`, { method: 'DELETE', signal: controller.signal });
      if (!res.ok) throw new Error(await readApiError(res, t.common.error));
      if (!mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setItems((s) => s.filter((x) => x.id !== id));
      startTransition(() => router.refresh());
    } catch (e) {
      if (!mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setError((e as Error).message);
    } finally {
      if (mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        busyRef.current = false;
        setBusy(null);
      }
    }
  }

  return (
    <div>
      <header className="mb-6 flex items-center gap-3">
        <Bookmark className="h-7 w-7 text-accent" aria-hidden />
        <h1 className="text-2xl font-bold">{t.series.pageTitle}</h1>
      </header>

      <div className="mb-8 rounded-2xl border border-border bg-bg-card p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <input
            className="input"
            placeholder={t.series.newName}
            aria-label={t.series.newName}
            value={name}
            disabled={busy !== null}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input"
            placeholder={t.series.newDescription}
            aria-label={t.series.newDescription}
            value={description}
            disabled={busy !== null}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button type="button" className="btn btn-primary" onClick={create} disabled={!name.trim() || pending || busy !== null}>
            <Plus className="h-4 w-4" aria-hidden /> {t.series.create}
          </button>
        </div>
        {error && (
          <div className="mt-3">
            <ErrorAlert title={t.common.error}>{error}</ErrorAlert>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="py-16 text-center text-muted">{t.series.empty}</div>
      ) : (
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns:
              'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))',
          }}
        >
          {items.map((s) => (
            <div key={s.id} className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-card p-4 hover:border-accent">
              <Link href={`/series/${s.id}`} className="min-w-0 flex-1">
                <div className="font-semibold">{s.name}</div>
                {s.description && <div className="line-clamp-2 text-xs text-muted" title={s.description}>{s.description}</div>}
              </Link>
              <button
                type="button"
                className="btn btn-danger transition-opacity can-hover:md:opacity-0 can-hover:md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                onClick={() => remove(s.id)}
                aria-label={t.series.delete}
                disabled={busy !== null}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
