'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useDisplaySettings } from '@/lib/settings/client';
import { useT } from '@/lib/i18n/client';

/**
 * Compact spoiler-level toggle, modelled on VNDB's site preference:
 *   ○ Hide all spoilers (default)
 *   1 Show minor spoilers
 *   2 Show all spoilers
 * The current state is mirrored to localStorage by DisplaySettingsProvider,
 * and every page that filters traits/tags/character meta reads from it.
 *
 * Rendered as a single button with a popover; the user can also flip the
 * "Sexual traits" toggle from here so all the spoiler-related UX lives
 * in one place.
 */
export function SpoilerToggle() {
  const t = useT();
  const { settings, set } = useDisplaySettings();
  const [open, setOpen] = useState(false);

  const labelByLevel: Record<0 | 1 | 2, string> = {
    0: t.spoiler.lvl0,
    1: t.spoiler.lvl1,
    2: t.spoiler.lvl2,
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-bg-card px-2 text-xs font-semibold text-muted hover:text-white"
        title={t.spoiler.title}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {settings.spoilerLevel === 0 ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        <span>{labelByLevel[settings.spoilerLevel]}</span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-full z-40 mt-1 w-[min(92vw,15rem)] rounded-lg border border-border bg-bg-card p-2 shadow-card">
            <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted">
              {t.spoiler.title}
            </div>
            {[0, 1, 2].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => {
                  set('spoilerLevel', lvl as 0 | 1 | 2);
                }}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-bg-elev ${
                  settings.spoilerLevel === lvl ? 'text-accent' : 'text-muted'
                }`}
              >
                <span>{labelByLevel[lvl as 0 | 1 | 2]}</span>
                {settings.spoilerLevel === lvl && <span aria-hidden>✓</span>}
              </button>
            ))}
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              onClick={() => set('showSexualTraits', !settings.showSexualTraits)}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-bg-elev ${
                settings.showSexualTraits ? 'text-accent' : 'text-muted'
              }`}
            >
              <span>{t.spoiler.showSexual}</span>
              <span aria-hidden>{settings.showSexualTraits ? '✓' : '○'}</span>
            </button>
            <p className="mt-1 px-2 text-[10px] text-muted/70">{t.spoiler.hint}</p>
          </div>
        </>
      )}
    </div>
  );
}
