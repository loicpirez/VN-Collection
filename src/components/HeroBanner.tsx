'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Crosshair, EyeOff, Loader2, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { isExplicit, useDisplaySettings } from '@/lib/settings/client';
import { useToast } from './ToastProvider';

interface Props {
  vnId: string;
  src: string | null;
  /** True if a custom banner is set (not the auto-derived blurred cover). */
  customBanner: boolean;
  initialPosition: string | null;
  inCollection: boolean;
  /** Sexual content flag of the underlying image, for blur-R18 handling. */
  sexual?: number | null;
}

const DEFAULT_POSITION = '50% 50%';

function clamp(n: number): number {
  if (Number.isNaN(n)) return 50;
  return Math.max(0, Math.min(100, n));
}

export function HeroBanner({ vnId, src, customBanner, initialPosition, inCollection, sexual }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const { settings } = useDisplaySettings();
  const [r18Reveal, setR18Reveal] = useState(false);
  const explicit = isExplicit(sexual ?? null, settings.nsfwThreshold);
  const shouldBlurR18 = explicit && settings.blurR18 && !r18Reveal;
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [position, setPosition] = useState<string>(initialPosition || DEFAULT_POSITION);
  const [draftPosition, setDraftPosition] = useState<string>(position);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    setPosition(initialPosition || DEFAULT_POSITION);
  }, [initialPosition]);

  function fromEvent(e: { clientX: number; clientY: number }): string | null {
    const el = ref.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = clamp(((e.clientX - rect.left) / rect.width) * 100);
    const y = clamp(((e.clientY - rect.top) / rect.height) * 100);
    return `${x.toFixed(1)}% ${y.toFixed(1)}%`;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!editing) return;
    e.preventDefault();
    draggingRef.current = true;
    // Capture on the container so subsequent move events keep coming here
    // even if the pointer leaves the element.
    ref.current?.setPointerCapture(e.pointerId);
    const p = fromEvent(e);
    if (p) setDraftPosition(p);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!editing || !draggingRef.current) return;
    const p = fromEvent(e);
    if (p) setDraftPosition(p);
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!editing) return;
    draggingRef.current = false;
    ref.current?.releasePointerCapture?.(e.pointerId);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/collection/${vnId}/banner`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: draftPosition }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t.common.error);
      }
      setPosition(draftPosition);
      setEditing(false);
      toast.success(t.toast.bannerSaved);
      startTransition(() => router.refresh());
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/collection/${vnId}/banner`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: null }),
      });
      if (!res.ok) throw new Error(t.common.error);
      setPosition(DEFAULT_POSITION);
      setDraftPosition(DEFAULT_POSITION);
      setEditing(false);
      toast.success(t.toast.bannerReset);
      startTransition(() => router.refresh());
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const activePos = editing ? draftPosition : position;
  const [xRaw, yRaw] = activePos.split(' ');
  const xPct = parseFloat(xRaw);
  const yPct = parseFloat(yRaw);

  if (settings.hideImages && !editing) {
    return (
      <div className="relative flex h-32 w-full items-center justify-center bg-bg-elev/40">
        <span className="inline-flex items-center gap-2 text-xs text-muted">
          <EyeOff className="h-4 w-4" aria-hidden /> {t.settings.hiddenImage}
        </span>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg-card via-bg-card/70 to-transparent" />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`group relative h-64 w-full overflow-hidden ${
        editing ? 'cursor-crosshair touch-none' : ''
      }`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden
          draggable={false}
          className={`pointer-events-none h-full w-full select-none object-cover transition-[object-position,filter,opacity,transform] duration-200 ${
            editing
              ? ''
              : shouldBlurR18
                ? 'scale-110 blur-2xl opacity-70'
                : !customBanner
                  ? 'scale-110 blur-xl opacity-50'
                  : ''
          }`}
          style={{ objectPosition: activePos }}
        />
      ) : (
        <div className="pointer-events-none h-full w-full bg-gradient-to-b from-bg-elev to-bg-card" />
      )}

      {shouldBlurR18 && !editing && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setR18Reveal(true);
          }}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-black/40 text-white backdrop-blur-sm hover:bg-black/30"
        >
          <ShieldAlert className="h-5 w-5 text-accent" aria-hidden />
          <span className="text-xs font-bold uppercase tracking-wider">{t.settings.r18Blurred}</span>
          <span className="text-[10px] opacity-80">{t.settings.clickToReveal}</span>
        </button>
      )}

      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-t from-bg-card via-bg-card/70 to-transparent ${
          editing ? 'opacity-30' : ''
        }`}
      />

      {editing && Number.isFinite(xPct) && Number.isFinite(yPct) && (
        <>
          {/* horizontal/vertical guide lines */}
          <div className="pointer-events-none absolute inset-y-0" style={{ left: `${xPct}%` }}>
            <div className="h-full w-px bg-accent/70" />
          </div>
          <div className="pointer-events-none absolute inset-x-0" style={{ top: `${yPct}%` }}>
            <div className="h-px w-full bg-accent/70" />
          </div>
          {/* focal point marker */}
          <div
            className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-accent/30 shadow-[0_0_0_2px_rgba(0,0,0,0.6)]"
            style={{ left: `${xPct}%`, top: `${yPct}%` }}
          />
        </>
      )}

      {inCollection && src && (
        <div
          className={`absolute right-3 top-3 z-10 flex flex-wrap items-center gap-1.5 transition-opacity ${
            editing
              ? 'opacity-100'
              : 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:hover:opacity-100'
          }`}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {!editing ? (
            <button
              type="button"
              onClick={() => {
                setDraftPosition(position);
                setEditing(true);
              }}
              className="inline-flex items-center gap-1 rounded-md bg-bg-card/90 px-2 py-1 text-[11px] font-semibold text-white shadow-card backdrop-blur transition-colors hover:bg-accent hover:text-bg"
              title={t.banner.adjust}
            >
              <Crosshair className="h-3 w-3" /> {t.banner.adjust}
            </button>
          ) : (
            <>
              <span className="rounded-md bg-bg-card/90 px-2 py-1 font-mono text-[10px] text-muted shadow-card backdrop-blur">
                {draftPosition}
              </span>
              <button
                type="button"
                onClick={save}
                disabled={busy || pending}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2 text-[11px] font-bold text-bg shadow-card transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                {t.common.save}
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={busy || pending}
                className="inline-flex h-7 items-center gap-1 rounded-md bg-bg-card/90 px-2 text-[11px] font-semibold text-muted shadow-card backdrop-blur transition-colors hover:text-white"
                title={t.banner.resetPosition}
              >
                <RotateCcw className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftPosition(position);
                  setEditing(false);
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-bg-card/90 text-muted shadow-card backdrop-blur transition-colors hover:text-white"
                title={t.common.cancel}
              >
                <X className="h-3 w-3" />
              </button>
            </>
          )}
          {error && (
            <span className="rounded-md bg-status-dropped/90 px-2 py-1 text-[10px] text-white">{error}</span>
          )}
        </div>
      )}

      {editing && (
        <div
          className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-md bg-bg-card/90 px-3 py-1 text-[11px] text-white shadow-card backdrop-blur"
        >
          {t.banner.editHint}
        </div>
      )}
    </div>
  );
}
