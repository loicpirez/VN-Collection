'use client';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, Settings2, ShieldAlert } from 'lucide-react';
import { useDisplaySettings } from '@/lib/settings/client';
import { useLocale, useT } from '@/lib/i18n/client';
import { fmtNum } from '@/lib/locale-number';

const CONTENT_PANEL_WIDTH = 320;
const CONTENT_PANEL_GUTTER = 12;

export interface ContentPanelPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

export function calculateContentPanelPosition(
  trigger: Pick<DOMRect, 'right' | 'bottom'>,
  viewportWidth: number,
  viewportHeight: number,
): ContentPanelPosition {
  const availableWidth = Math.max(0, viewportWidth - CONTENT_PANEL_GUTTER * 2);
  const width = Math.min(CONTENT_PANEL_WIDTH, availableWidth);
  const maximumLeft = Math.max(CONTENT_PANEL_GUTTER, viewportWidth - width - CONTENT_PANEL_GUTTER);
  const left = Math.min(
    Math.max(CONTENT_PANEL_GUTTER, trigger.right - width),
    maximumLeft,
  );
  const top = Math.max(CONTENT_PANEL_GUTTER, trigger.bottom + 4);
  return {
    left,
    top,
    width,
    maxHeight: Math.max(0, viewportHeight - top - CONTENT_PANEL_GUTTER),
  };
}

/**
 * Content-safety hub. The closed-eye icon in the navbar opens a
 * popover that exposes every "what shows on screen" preference in
 * one place:
 *   - Spoiler level (0 / 1 / 2, matches VNDB's site preference)
 *   - Hide images globally
 *   - Blur R18 imagery
 *   - NSFW threshold slider (0-2 in 0.1 steps)
 *   - Hide sexual images outright
 *   - Show sexual traits
 *
 * All values are mirrored to localStorage + cookie by
 * DisplaySettingsProvider, so SSR pages can pre-render with the
 * right gating without a flash on hydration. A footer button
 * dispatches `vn:open-settings` so the user can jump from this
 * popover into the full SettingsButton modal for everything
 * else (VNDB token, default sort, Steam, …).
 */
export function SpoilerToggle() {
  const t = useT();
  const locale = useLocale();
  const { settings, set } = useDisplaySettings();
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const focusedForOpenRef = useRef(false);
  const popoverId = useId();
  const [panelPosition, setPanelPosition] = useState<ContentPanelPosition | null>(null);

  const positionPanel = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setPanelPosition(calculateContentPanelPosition(
      trigger.getBoundingClientRect(),
      window.innerWidth,
      window.innerHeight,
    ));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    positionPanel();
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
    return () => {
      window.removeEventListener('resize', positionPanel);
      window.removeEventListener('scroll', positionPanel, true);
    };
  }, [open, positionPanel]);

  useEffect(() => {
    if (!open) return;
    function outside(e: MouseEvent) {
      const target = e.target as Node;
      if (!popRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', outside);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', outside);
      window.removeEventListener('keydown', esc);
      focusedForOpenRef.current = false;
      triggerRef.current?.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open || !panelPosition || focusedForOpenRef.current) return;
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus({ preventScroll: true });
    focusedForOpenRef.current = true;
  }, [open, panelPosition]);

  const labelByLevel: Record<0 | 1 | 2, string> = {
    0: t.spoiler.lvl0,
    1: t.spoiler.lvl1,
    2: t.spoiler.lvl2,
  };

  const lit = settings.spoilerLevel !== 0 || !settings.blurR18;

  function openFullSettings() {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('vn:open-settings'));
  }

  return (
    <div ref={popRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="tap-target inline-flex h-11 items-center gap-1.5 rounded-lg border border-border bg-bg-card px-2 text-xs font-semibold text-muted hover:text-white"
        title={t.contentControls.title}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={t.contentControls.title}
      >
        {lit ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
        <span>{labelByLevel[settings.spoilerLevel]}</span>
      </button>
      {open && panelPosition && createPortal(
        <div
          ref={panelRef}
          id={popoverId}
          className="fixed z-layer-popover overflow-y-auto overscroll-contain rounded-lg border border-border bg-bg-card p-3 shadow-card"
          style={panelPosition}
          role="region"
          aria-label={t.contentControls.title}
        >
          <header className="mb-2 flex items-baseline justify-between">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted">
              <ShieldAlert className="h-3 w-3" aria-hidden /> {t.contentControls.title}
            </span>
          </header>

          <section className="mb-3">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted/80">
              {t.spoiler.title}
            </div>
            <div role="radiogroup" aria-label={t.spoiler.title} className="grid grid-cols-3 gap-1">
              {[0, 1, 2].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  role="radio"
                  aria-checked={settings.spoilerLevel === lvl}
                  onClick={() => set('spoilerLevel', lvl as 0 | 1 | 2)}
                  className={`rounded-md border px-1.5 py-1 text-[11px] font-semibold transition-colors ${
                    settings.spoilerLevel === lvl
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border bg-bg-elev/40 text-muted hover:border-accent/40 hover:text-white'
                  }`}
                >
                  {labelByLevel[lvl as 0 | 1 | 2]}
                </button>
              ))}
            </div>
          </section>

          <section className="mb-3 space-y-1.5">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted/80">
              {t.contentControls.nsfwSection}
            </div>
            <RowToggle
              label={t.settings.hideImages}
              hint={t.settings.hideImagesDesc}
              value={settings.hideImages}
              onChange={(v) => set('hideImages', v)}
            />
            <RowToggle
              label={t.settings.blurR18}
              hint={t.settings.blurR18Desc}
              value={settings.blurR18}
              onChange={(v) => set('blurR18', v)}
            />
            <RowToggle
              label={t.settings.hideSexual}
              hint={t.settings.hideSexualDesc}
              value={settings.hideSexual}
              onChange={(v) => set('hideSexual', v)}
            />
            <div className="rounded-md border border-border bg-bg-elev/40 px-2 py-2">
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="font-semibold">{t.settings.nsfwThreshold}</span>
                <span className="font-mono text-[11px] text-accent">
                  {fmtNum(settings.nsfwThreshold, locale, 1)} / 2.0
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={settings.nsfwThreshold}
                onChange={(e) => set('nsfwThreshold', Number(e.target.value))}
                className="w-full accent-accent"
                aria-label={t.settings.nsfwThreshold}
              />
              <p className="mt-1 text-[10px] text-muted">{t.settings.nsfwThresholdDesc}</p>
            </div>
            <RowToggle
              label={t.spoiler.showSexual}
              hint={t.contentControls.showSexualHint}
              value={settings.showSexualTraits}
              onChange={(v) => set('showSexualTraits', v)}
            />
          </section>

          <button
            type="button"
            onClick={openFullSettings}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-bg-elev/40 px-2 py-1.5 text-xs font-semibold text-muted hover:border-accent hover:text-accent"
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden />
            {t.contentControls.openSettings}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

function RowToggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const labelId = useId();
  const hintId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-labelledby={labelId}
      aria-describedby={hintId}
      onClick={() => onChange(!value)}
      className="flex w-full items-start justify-between gap-2 rounded-md border border-border bg-bg-elev/40 px-2 py-1.5 text-left hover:border-accent/40"
    >
      <span className="min-w-0 flex-1">
        <span id={labelId} className="block text-xs font-semibold">{label}</span>
        <span id={hintId} className="block text-[10px] text-muted">{hint}</span>
      </span>
      <span
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
          value ? 'bg-accent' : 'bg-bg-elev'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150 ${
            value ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
