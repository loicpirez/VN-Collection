'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Eye, EyeOff, Settings2, ShieldAlert } from 'lucide-react';
import { useDisplaySettings } from '@/lib/settings/client';
import { useT } from '@/lib/i18n/client';

/**
 * Content-safety hub. The closed-eye icon in the navbar opens a
 * popover that exposes every "what shows on screen" preference in
 * one place:
 *   - Spoiler level (0 / 1 / 2, matches VNDB's site preference)
 *   - Hide images globally
 *   - Blur R18 imagery
 *   - NSFW threshold slider (0–2 in 0.1 steps)
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
  const { settings, set } = useDisplaySettings();
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    function outside(e: MouseEvent) {
      if (!popRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', outside);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', outside);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const labelByLevel: Record<0 | 1 | 2, string> = {
    0: t.spoiler.lvl0,
    1: t.spoiler.lvl1,
    2: t.spoiler.lvl2,
  };

  // The lit state for the icon is "are there any non-default safety
  // gates active" — spoilerLevel != 0 OR any nsfw setting is loosened.
  const lit = settings.spoilerLevel !== 0 || !settings.blurR18 || !settings.hideSexual;

  function openFullSettings() {
    setOpen(false);
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('vn:open-settings'));
  }

  return (
    <div ref={popRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="tap-target inline-flex h-11 items-center gap-1.5 rounded-lg border border-border bg-bg-card px-2 text-xs font-semibold text-muted hover:text-white"
        title={t.contentControls.title}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={t.contentControls.title}
      >
        {lit ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
        <span>{labelByLevel[settings.spoilerLevel]}</span>
      </button>
      {open && (
        <div
          id={popoverId}
          className="absolute right-0 top-full z-40 mt-1 w-[min(95vw,20rem)] rounded-lg border border-border bg-bg-card p-3 shadow-card"
          role="dialog"
          aria-label={t.contentControls.title}
        >
          <header className="mb-2 flex items-baseline justify-between">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted">
              <ShieldAlert className="h-3 w-3" /> {t.contentControls.title}
            </span>
          </header>

          <section className="mb-3">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted/80">
              {t.spoiler.title}
            </div>
            <div role="radiogroup" className="grid grid-cols-3 gap-1">
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
                  {settings.nsfwThreshold.toFixed(1)} / 2.0
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
            <Settings2 className="h-3.5 w-3.5" />
            {t.contentControls.openSettings}
          </button>
        </div>
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
