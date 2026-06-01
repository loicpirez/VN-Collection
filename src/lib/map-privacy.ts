import type { Locale } from './i18n/dictionaries';

export const MAP_EXTERNAL_NETWORK_CONSENT_KEY = 'vncoll.map.external-network.v1';
export const MAP_EXTERNAL_NETWORK_CHANGED_EVENT = 'vn:map-external-network-change';
let ephemeralConsent = false;

/** Read whether the operator allowed map-related third-party requests. */
export function readMapExternalNetworkConsent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem(MAP_EXTERNAL_NETWORK_CONSENT_KEY);
    return stored == null ? ephemeralConsent : stored === 'true';
  } catch {
    return ephemeralConsent;
  }
}

/** Persist map-related third-party request consent and notify open surfaces. */
export function writeMapExternalNetworkConsent(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  ephemeralConsent = enabled;
  try {
    window.localStorage.setItem(MAP_EXTERNAL_NETWORK_CONSENT_KEY, String(enabled));
  } catch {}
  window.dispatchEvent(new CustomEvent(MAP_EXTERNAL_NETWORK_CHANGED_EVENT, { detail: enabled }));
}

/** Build the Nominatim language preference from the active application locale. */
export function geocodingAcceptLanguage(locale: Locale): string {
  if (locale === 'fr') return 'fr,ja;q=0.8,en;q=0.7';
  if (locale === 'ja') return 'ja,en;q=0.8';
  return 'en,ja;q=0.8';
}
