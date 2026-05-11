'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings2, X } from 'lucide-react';
import { useDisplaySettings } from '@/lib/settings/client';
import { useT } from '@/lib/i18n/client';

export function SettingsButton() {
  const t = useT();
  const { settings, set, reset } = useDisplaySettings();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg-card text-muted hover:text-white"
        onClick={() => setOpen(true)}
        aria-label={t.settings.title}
        title={t.settings.title}
      >
        <Settings2 className="h-4 w-4" />
      </button>

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/70 p-6 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-label={t.settings.title}
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div className="relative mt-12 w-full max-w-md rounded-2xl border border-border bg-bg-card p-6 shadow-card">
                <button
                  type="button"
                  className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-bg-elev hover:text-white"
                  onClick={() => setOpen(false)}
                  aria-label={t.common.close}
                >
                  <X className="h-4 w-4" />
                </button>
                <h2 className="mb-1 text-lg font-bold">{t.settings.title}</h2>
                <p className="mb-5 text-xs text-muted">{t.settings.subtitle}</p>

                <div className="flex flex-col gap-4">
                  <Toggle
                    label={t.settings.hideImages}
                    description={t.settings.hideImagesDesc}
                    value={settings.hideImages}
                    onChange={(v) => set('hideImages', v)}
                  />
                  <Toggle
                    label={t.settings.blurR18}
                    description={t.settings.blurR18Desc}
                    value={settings.blurR18}
                    onChange={(v) => set('blurR18', v)}
                  />
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-semibold">{t.settings.nsfwThreshold}</span>
                    <span className="text-[11px] text-muted">{t.settings.nsfwThresholdDesc}</span>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.1}
                      value={settings.nsfwThreshold}
                      onChange={(e) => set('nsfwThreshold', Number(e.target.value))}
                      className="accent-accent"
                    />
                    <span className="text-xs text-muted">{settings.nsfwThreshold.toFixed(1)} / 2.0</span>
                  </label>
                  <Toggle
                    label={t.settings.preferLocal}
                    description={t.settings.preferLocalDesc}
                    value={settings.preferLocalImages}
                    onChange={(v) => set('preferLocalImages', v)}
                  />
                  <Toggle
                    label={t.settings.preferNativeTitle}
                    description={t.settings.preferNativeTitleDesc}
                    value={settings.preferNativeTitle}
                    onChange={(v) => set('preferNativeTitle', v)}
                  />
                </div>

                <div className="mt-6 flex justify-between">
                  <button type="button" className="btn" onClick={reset}>
                    {t.settings.reset}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
                    {t.common.close}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border bg-bg-elev/50 p-3 hover:border-accent">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-[11px] text-muted">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${value ? 'bg-accent' : 'bg-bg-elev'}`}
      >
        <span
          className={`absolute top-0.5 left-0 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            value ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}
