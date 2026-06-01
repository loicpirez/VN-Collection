'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import {
  MAP_EXTERNAL_NETWORK_CHANGED_EVENT,
  readMapExternalNetworkConsent,
  writeMapExternalNetworkConsent,
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

  useEffect(() => {
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

  return (
    <div className={`rounded-lg border border-border bg-bg-elev/35 ${compact ? 'p-2.5' : 'p-3'}`}>
      <div className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-white">{t.map.externalPrivacyTitle}</p>
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
