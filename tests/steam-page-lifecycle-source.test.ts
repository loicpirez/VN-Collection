import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const STEAM = readFileSync('src/app/steam/page.tsx', 'utf8');
const INTEGRATIONS = readFileSync('src/components/settings/IntegrationsSettingsTab.tsx', 'utf8');
const PLACE_MODAL = readFileSync('src/components/AddEditPlaceModal.tsx', 'utf8');

describe('Steam page lifecycle ownership', () => {
  it('settles every refresh loading surface after failures', () => {
    expect(STEAM).toContain('setLinksLoading(true)');
    expect(STEAM).toContain('setLinksLoading(false)');
    expect(STEAM).toContain('setSuggestionsLoading(false)');
    expect(STEAM).toContain('setUnlinkedLoading(false)');
  });

  it('owns and aborts mutations, including unlink confirmation', () => {
    expect(STEAM).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(STEAM).toContain('const mutationInFlightRef = useRef(false)');
    expect(STEAM).toContain('mutationAbortRef.current?.abort()');
    expect(STEAM).toContain('mutationAbortRef.current === controller');
    expect(STEAM).toContain('controller.signal.aborted');
    expect(STEAM.indexOf('const controller = beginMutation();', STEAM.indexOf('async function unlink')))
      .toBeLessThan(STEAM.indexOf('await confirm({ message: t.steam.unlinkConfirm'));
  });

  it('aborts obsolete per-row collection searches', () => {
    expect(STEAM).toContain('const assignAbortRefs = useRef<Record<number, AbortController>>({})');
    expect(STEAM).toContain('assignAbortRefs.current[appid]?.abort()');
    expect(STEAM).toContain('signal: controller.signal');
    expect(STEAM).toContain('assignAbortRefs.current[appid] !== controller');
    expect(STEAM).toContain('for (const controller of Object.values(assignAbortRefs.current)) controller.abort()');
  });

  it('uses localized placeholders for settings and place URL hints', () => {
    expect(INTEGRATIONS).toContain('placeholder={t.settings.proxyHostPlaceholder}');
    expect(INTEGRATIONS).toContain('placeholder={t.settings.proxyPortPlaceholder}');
    expect(PLACE_MODAL).toContain('placeholder={t.places.urlInputPlaceholder as string}');
  });
});
