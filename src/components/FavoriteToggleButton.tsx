'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

interface Props {
  vnId: string;
  /** Whether the VN is currently favorited (for optimistic UI). */
  initial: boolean;
  /** Whether the VN is in the collection. If false, the button auto-adds it (status=planning) before toggling. */
  inCollection?: boolean;
  /** Visual mode: floating overlay on a card, or inline pill on detail pages. */
  variant?: 'overlay' | 'inline';
  /** Stop the parent <Link> from navigating when this is clicked. */
  stopPropagation?: boolean;
}

export function FavoriteToggleButton({
  vnId,
  initial,
  inCollection = true,
  variant = 'overlay',
  stopPropagation = true,
}: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function toggle(e: React.MouseEvent | React.KeyboardEvent) {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    try {
      if (!inCollection) {
        const r0 = await fetch(`/api/collection/${vnId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'planning' }),
        });
        if (!r0.ok) throw new Error((await r0.json().catch(() => ({}))).error || t.common.error);
      }
      const r = await fetch(`/api/collection/${vnId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: next }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(next ? t.toast.favoriteAdded : t.toast.favoriteRemoved);
      startTransition(() => router.refresh());
    } catch (err) {
      setOn(!next);
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const label = on ? t.form.favoriteOn : t.form.favoriteOff;

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={on}
        aria-label={label}
        title={label}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
          on
            ? 'border-status-dropped/60 bg-status-dropped/10 text-status-dropped'
            : 'border-border bg-bg-elev/40 text-muted hover:border-status-dropped/40 hover:text-status-dropped'
        }`}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Heart className={`h-3.5 w-3.5 ${on ? 'fill-status-dropped' : ''}`} aria-hidden />
        )}
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`absolute z-30 tap-target inline-flex h-7 w-7 items-center justify-center rounded-md shadow-card transition-opacity ${
        on
          ? 'bg-status-dropped/90 text-white hover:bg-status-dropped !opacity-100'
          : 'bg-bg-card/85 text-muted backdrop-blur hover:text-status-dropped md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'
      } left-2 top-2`}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Heart className={`h-4 w-4 ${on ? 'fill-white' : ''}`} aria-hidden />
      )}
    </button>
  );
}
