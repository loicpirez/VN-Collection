import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAP_EXTERNAL_NETWORK_CONSENT_KEY,
  MAP_PRIVACY_NOTICE_DISMISSED_KEY,
  geocodingAcceptLanguage,
  readMapExternalNetworkConsent,
  readMapPrivacyNoticeDismissed,
  writeMapExternalNetworkConsent,
  writeMapPrivacyNoticeDismissed,
} from '@/lib/map-privacy';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('map third-party privacy boundary', () => {
  it('defaults to blocked outside the browser and keeps writes safe', () => {
    expect(MAP_EXTERNAL_NETWORK_CONSENT_KEY).toBe('vncoll.map.external-network.v1');
    expect(MAP_PRIVACY_NOTICE_DISMISSED_KEY).toBe('vncoll.map.privacy-notice-dismissed.v1');
    expect(readMapExternalNetworkConsent()).toBe(false);
    expect(readMapPrivacyNoticeDismissed()).toBe(false);
    expect(() => writeMapExternalNetworkConsent(true)).not.toThrow();
    expect(() => writeMapPrivacyNoticeDismissed(true)).not.toThrow();
  });

  it('derives Nominatim language preferences from the active locale', () => {
    expect(geocodingAcceptLanguage('fr')).toBe('fr,ja;q=0.8,en;q=0.7');
    expect(geocodingAcceptLanguage('en')).toBe('en,ja;q=0.8');
    expect(geocodingAcceptLanguage('ja')).toBe('ja,en;q=0.8');
  });

  it('gates tiles and geocoding behind the shared control', () => {
    const mapPage = source('src/components/MapPageClient.tsx');
    const modal = source('src/components/AddEditPlaceModal.tsx');
    const canvas = source('src/components/MapCanvas.tsx');
    const control = source('src/components/MapPrivacyControl.tsx');
    expect(mapPage).toContain('<MapPrivacyControl onChange={handleExternalNetworkChange} />');
    expect(mapPage).toContain('!externalNetworkAllowed ? (');
    expect(mapPage).toContain('externalNetworkAllowed={externalNetworkAllowed}');
    expect(mapPage).toContain("'Accept-Language': geocodingAcceptLanguage(locale)");
    expect(modal).toContain('<MapPrivacyControl compact onChange={handleExternalNetworkChange} />');
    expect(modal).toContain('disabled={!externalNetworkAllowed}');
    expect(modal).toContain("'Accept-Language': geocodingAcceptLanguage(locale)");
    expect(canvas).toContain('if (!externalNetworkAllowed || !containerRef.current || mapRef.current) return;');
    expect(control).toContain("event instanceof CustomEvent && typeof event.detail === 'boolean'");
    expect(control).toContain('writeMapPrivacyNoticeDismissed(true)');
    expect(control).toContain('writeMapPrivacyNoticeDismissed(false)');
    expect(mapPage).not.toContain("'Accept-Language': 'ja,en'");
    expect(modal).not.toContain("'Accept-Language': 'ja,en'");
  });

  it('isolates Leaflet below page overlays and keeps place dialogs above map content', () => {
    const mapPage = source('src/components/MapPageClient.tsx');
    const modal = source('src/components/AddEditPlaceModal.tsx');
    const canvas = source('src/components/MapCanvas.tsx');
    expect(canvas).toContain('relative isolate z-0 w-full overflow-hidden');
    expect(mapPage).toContain('className="absolute z-30 mt-1');
    expect(mapPage).not.toContain('z-[9999]');
    expect(modal).toContain('className="fixed inset-0 z-[1000]');
  });

  it('aborts stale geocoding work and active requests after consent revocation', () => {
    for (const path of [
      'src/components/MapPageClient.tsx',
      'src/components/AddEditPlaceModal.tsx',
    ]) {
      const body = source(path);
      expect(body).toContain('new AbortController()');
      expect(body).toContain('.current?.abort()');
      expect(body).toContain('signal: controller.signal');
      expect(body).toContain('if (!controller.signal.aborted');
    }
  });

  it('documents CARTO and Nominatim as the opt-in third-party boundary', () => {
    for (const path of ['README.md', 'FEATURES.md', 'CLAUDE.md']) {
      const text = source(path);
      expect(text, path).toContain('CARTO');
      expect(text, path).toContain('Nominatim');
      expect(text, path).toContain('OpenStreetMap');
    }
  });
});
