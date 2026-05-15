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
  const triggerRef = useRef<Element | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [favLocal, setFavLocal] = useState(favorite);

  useEffect(() => {
    // Remember the element that had focus when the menu opened so
    // we can return there on close — the ARIA menu pattern requires
    // it for keyboard users.
    triggerRef.current = typeof document !== 'undefined' ? document.activeElement : null;
    function outside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      // Arrow-key navigation through `role="menuitem"` siblings —
      // ARIA menu pattern. Tab still moves normally.
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      const items = Array.from(
        ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]') ?? [],
      ).filter((el) => !el.hasAttribute('disabled'));
      if (items.length === 0) return;
      const idx = items.indexOf(document.activeElement as HTMLElement);
      let next: HTMLElement | undefined;
      if (e.key === 'Home') next = items[0];
      else if (e.key === 'End') next = items[items.length - 1];
      else if (e.key === 'ArrowDown') next = items[(idx + 1 + items.length) % items.length] ?? items[0];
      else next = items[(idx - 1 + items.length) % items.length] ?? items[items.length - 1];
      e.preventDefault();
      next?.focus();
    }
    window.addEventListener('mousedown', outside, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('mousedown', outside, true);
      window.removeEventListener('keydown', key);
      // Return focus to whatever had it before the menu opened.
      const t = triggerRef.current;
      if (t && t instanceof HTMLElement && document.contains(t)) {
        t.focus({ preventScroll: true });
      }
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

  // Push the menu inside the viewport so a right-click near the
  // screen edge doesn't clip the options off-screen. Clamp on both
  // axes from both directions so even a 360-wide phone (the menu
  // can be wider than the viewport itself, which used to push
  // `left` negative) ends up on-screen.
  const VIEW_W = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const VIEW_H = typeof window !== 'undefined' ? window.innerHeight : 768;
  // Slightly conservative so the menu always has 8 px of breathing
  // room on every side regardless of the row count.
  const MENU_W = Math.min(220, VIEW_W - 16);
  const MENU_H = Math.min(380, VIEW_H - 16);
  const left = Math.max(8, Math.min(anchor.x, VIEW_W - MENU_W - 8));
  const top = Math.max(8, Math.min(anchor.y, VIEW_H - MENU_H - 8));

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
          className="tap-target-tight rounded text-muted hover:text-white"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      </div>

      <div className="border-t border-border" />

      <div className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-wider text-muted">{t.quickActions.statusLabel}</div>
      {STATUSES.map((s) => {
        const active = status === s;
        return (
          <button
            key={s}
            role="menuitem"
            type="button"
            disabled={!!busy}
            onClick={() => patch({ status: active ? null : s }, `status-${s}`)}
            className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left transition-colors sm:py-1 ${
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
        role="menuitem"
        type="button"
        disabled={!!busy}
        onClick={() => {
          // Compute next once and reuse for both the optimistic UI
          // and the request body — the old version read favLocal
          // inside setFavLocal then again in patch(), which works by
          // coincidence today but desyncs under React 19 concurrent
          // batching.
          const next = !favLocal;
          setFavLocal(next);
          patch({ favorite: next }, 'favorite');
        }}
        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left hover:bg-bg-elev sm:py-1"
      >
        <span className="inline-flex items-center gap-2">
          <Heart className={`h-3.5 w-3.5 ${favLocal ? 'fill-accent text-accent' : ''}`} />
          {favLocal ? t.quickActions.unfavorite : t.quickActions.favorite}
        </span>
        {busy === 'favorite' && <Loader2 className="h-3 w-3 animate-spin" />}
      </button>

      <Link
        href={`/vn/${vnId}`}
        role="menuitem"
        onClick={onClose}
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-bg-elev sm:py-1"
      >
        <Star className="h-3.5 w-3.5" aria-hidden /> {t.quickActions.open}
      </Link>

      {/*
        Two role sections, each with a light header so the rows
        don't read as one undifferentiated list of links. Each
        section renders Open + Filter on one line each so the
        menu height stays bounded even with both roles present.
        Touch-friendly: py-2 keeps every row ≥ WCAG's 40px target.
      */}
      {(developer?.id || publisher?.id) && (
        <div className="my-1 border-t border-border" />
      )}

      {developer?.id && (
        <>
          <div className="px-2 pb-0.5 pt-1 text-[10px] uppercase tracking-wider text-muted">
            {t.detail.developers}
          </div>
          <div className="flex items-stretch gap-1 px-1">
            <Link
              href={`/producer/${developer.id}`}
              role="menuitem"
              onClick={onClose}
              className="flex flex-1 items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-bg-elev sm:py-1"
            >
              <Building2 className="h-3.5 w-3.5" aria-hidden />
              <span className="truncate">{t.quickActions.openDeveloper}</span>
            </Link>
            <Link
              href={`/?producer=${developer.id}`}
              role="menuitem"
              onClick={onClose}
              aria-label={t.quickActions.filterSameDeveloper}
              title={t.quickActions.filterSameDeveloper}
              className="tap-target inline-flex w-11 items-center justify-center rounded-md hover:bg-bg-elev"
            >
              <Tag className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </>
      )}

      {publisher?.id && (
        <>
          <div className="px-2 pb-0.5 pt-1 text-[10px] uppercase tracking-wider text-accent-blue/80">
            {t.detail.publishers}
          </div>
          <div className="flex items-stretch gap-1 px-1">
            <Link
              href={`/producer/${publisher.id}`}
              role="menuitem"
              onClick={onClose}
              className="flex flex-1 items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-bg-elev sm:py-1"
            >
              <Package className="h-3.5 w-3.5" aria-hidden />
              <span className="truncate">{t.quickActions.openPublisher}</span>
            </Link>
            <Link
              href={`/?publisher=${publisher.id}`}
              role="menuitem"
              onClick={onClose}
              aria-label={t.quickActions.filterSamePublisher}
              title={t.quickActions.filterSamePublisher}
              className="tap-target inline-flex w-11 items-center justify-center rounded-md hover:bg-bg-elev"
            >
              <Tag className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
