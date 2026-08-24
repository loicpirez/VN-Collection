'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import {
  MAP_EXTERNAL_NETWORK_CHANGED_EVENT,
  readMapExternalNetworkConsent,
  readMapPrivacyNoticeDismissed,
  writeMapExternalNetworkConsent,
  writeMapPrivacyNoticeDismissed,
} from '@/lib/map-privacy';

export function MapPrivacyControl({
  compact = false,
  onChange,
}: {
  compact?: boolean;
  onChange?: (enabled: boolean) => void;
}) {
  const t = useT();
  const [enabled, setEnabled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(readMapPrivacyNoticeDismissed());
    const sync = (event?: Event) => {
      const next =
        event instanceof CustomEvent && typeof event.detail === 'boolean'
          ? event.detail
          : readMapExternalNetworkConsent();
      setEnabled(next);
      onChange?.(next);
    };
    sync();
    window.addEventListener(MAP_EXTERNAL_NETWORK_CHANGED_EVENT, sync);
    return () => window.removeEventListener(MAP_EXTERNAL_NETWORK_CHANGED_EVENT, sync);
  }, [onChange]);

  if (dismissed) {
    return (
      <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-bg-elev/35 px-2 py-1.5 text-xs text-muted">
        <ShieldCheck className="h-4 w-4 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0">{t.map.externalPrivacyHidden}</span>
        <button
          type="button"
          onClick={() => {
            writeMapPrivacyNoticeDismissed(false);
            setDismissed(false);
          }}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-border bg-bg-elev/60 px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent hover:text-white"
          title={t.map.externalPrivacyShow}
        >
          {t.map.externalPrivacyShow}
        </button>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-border bg-bg-elev/35 ${compact ? 'p-2.5' : 'p-3'}`}>
      <div className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-bold text-white">{t.map.externalPrivacyTitle}</p>
            <button
              type="button"
              onClick={() => {
                writeMapPrivacyNoticeDismissed(true);
                setDismissed(true);
              }}
              className="-m-2 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded text-muted transition-colors hover:text-white"
              title={t.map.externalPrivacyDismiss}
              aria-label={t.map.externalPrivacyDismiss}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">{t.map.externalPrivacyDesc}</p>
          <button
            type="button"
            onClick={() => writeMapExternalNetworkConsent(!enabled)}
            aria-pressed={enabled}
            className="btn mt-2 min-h-[44px] text-xs"
          >
            {enabled ? t.map.externalPrivacyDisable : t.map.externalPrivacyEnable}
          </button>
        </div>
      </div>
    </div>
  );
}
