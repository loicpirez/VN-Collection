'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, Check, Heart, Loader2, Package, Star, Tag, X } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';
import { STATUSES, type Status } from '@/lib/types';
import { StatusIcon } from './StatusIcon';

interface Props {
  vnId: string;
  status: Status | null | undefined;
  favorite: boolean;
  developer: { id?: string; name: string } | null;
  /**
   * Distinct publisher (not also credited as developer) for the VN.
   * Drives the optional "Open publisher" / "Filter by this publisher"
   * rows so the user can navigate the publisher side from a card
   * right-click without confusing it with the developer side.
   */
  publisher: { id?: string; name: string } | null;
  /** Screen-space anchor (clientX/clientY) — the menu places itself relative. */
  anchor: { x: number; y: number };
  onClose: () => void;
  onChange?: () => void;
}

/**
 * Right-click / long-press contextual menu attached to a library card. Lives
 * in a portal-free fixed-positioned div that auto-closes on outside click,
 * Escape, or any successful action. All actions hit existing PATCH routes
 * — no new server surface.
 */
export function CardContextMenu({ vnId, status, favorite, developer, publisher, anchor, onClose, onChange }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [favLocal, setFavLocal] = useState(favorite);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('mousedown', outside, true);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('mousedown', outside, true);
      window.removeEventListener('keydown', escape);
    };
  }, [onClose]);

  async function patch(body: Record<string, unknown>, label: string) {
    setBusy(label);
    try {
      const r = await fetch(`/api/collection/${vnId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.saved);
      onChange?.();
      startTransition(() => router.refresh());
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Push the menu inside the viewport so a right-click near the screen edge
  // doesn't clip the options off-screen.
  const VIEW_W = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const VIEW_H = typeof window !== 'undefined' ? window.innerHeight : 768;
  const MENU_W = 220;
  const MENU_H = 360;
  const left = Math.min(anchor.x, VIEW_W - MENU_W - 8);
  const top = Math.min(anchor.y, VIEW_H - MENU_H - 8);

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 w-[220px] rounded-lg border border-border bg-bg-card p-1 text-xs shadow-card"
      style={{ left, top }}
    >
      <div className="mb-1 flex items-center justify-between px-2 pt-1 text-[10px] uppercase tracking-wider text-muted">
        <span>{t.quickActions.title}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.common.close}
          className="rounded text-muted hover:text-white"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="border-t border-border" />

      <div className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-wider text-muted">{t.quickActions.statusLabel}</div>
      {STATUSES.map((s) => {
        const active = status === s;
        return (
          <button
            key={s}
            type="button"
            disabled={!!busy}
            onClick={() => patch({ status: active ? null : s }, `status-${s}`)}
            className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left transition-colors ${
              active ? 'bg-accent/15 text-accent' : 'hover:bg-bg-elev'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <StatusIcon status={s} className="h-3.5 w-3.5" />
              {t.status[s]}
            </span>
            {busy === `status-${s}` ? <Loader2 className="h-3 w-3 animate-spin" /> : active ? <Check className="h-3 w-3" /> : null}
          </button>
        );
      })}

      <div className="my-1 border-t border-border" />

      <button
        type="button"
        disabled={!!busy}
        onClick={() => {
          setFavLocal((v) => !v);
          patch({ favorite: !favLocal }, 'favorite');
        }}
        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left hover:bg-bg-elev"
      >
        <span className="inline-flex items-center gap-2">
          <Heart className={`h-3.5 w-3.5 ${favLocal ? 'fill-accent text-accent' : ''}`} />
          {favLocal ? t.quickActions.unfavorite : t.quickActions.favorite}
        </span>
        {busy === 'favorite' && <Loader2 className="h-3 w-3 animate-spin" />}
      </button>

      <Link
        href={`/vn/${vnId}`}
        onClick={onClose}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-bg-elev"
      >
        <Star className="h-3.5 w-3.5" /> {t.quickActions.open}
      </Link>

      {developer?.id && (
        <>
          <Link
            href={`/producer/${developer.id}`}
            onClick={onClose}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-bg-elev"
          >
            <Building2 className="h-3.5 w-3.5" /> {t.quickActions.openDeveloper}
          </Link>
          <Link
            href={`/?producer=${developer.id}`}
            onClick={onClose}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-bg-elev"
          >
            <Tag className="h-3.5 w-3.5" /> {t.quickActions.filterSameDeveloper}
          </Link>
        </>
      )}

      {publisher?.id && (
        <>
          <Link
            href={`/producer/${publisher.id}`}
            onClick={onClose}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-bg-elev"
          >
            <Package className="h-3.5 w-3.5" /> {t.quickActions.openPublisher}
          </Link>
          <Link
            href={`/?publisher=${publisher.id}`}
            onClick={onClose}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-bg-elev"
          >
            <Tag className="h-3.5 w-3.5" /> {t.quickActions.filterSamePublisher}
          </Link>
        </>
      )}
    </div>
  );
}
