/**
 * Pins the Integrations port input UX fix after operator feedback:
 *   "UI UX for Port is bad in integration it's easy by mistake to add
 *    or remove a number disable the number change up down direcly"
 *
 * The port `<input type="number">` rendered native browser stepper
 * arrows next to the digits. Tiny pointer movements or scroll-while-
 * focused could bump the port value by ±1 without the user noticing.
 *
 * Fix: apply the `.no-spinner` CSS class (defined in
 * `src/app/globals.css`) that removes the WebKit and Firefox stepper
 * controls. Also blur on wheel so the value can't be silently
 * incremented by a scroll while the input has focus.
 *
 * This is a static-source pin so the next file-format refactor can't
 * lose the protection silently.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SETTINGS_SRC = [
  'src/components/SettingsButton.tsx',
  'src/components/settings/IntegrationsSettingsTab.tsx',
]
  .map((rel) => readFileSync(join(__dirname, '..', rel), 'utf8'))
  .join('\n');

const GLOBALS_SRC = readFileSync(join(__dirname, '..', 'src/app/globals.css'), 'utf8');

describe('ProxySettingsSection: port input UX', () => {
  it('the port input opts into .no-spinner', () => {
    // Find the port input block; assert the className includes .no-spinner.
    const portBlock = SETTINGS_SRC.match(/id=\{portId\}[\s\S]*?className="[^"]+"/);
    expect(portBlock, 'port input block not found').toBeTruthy();
    expect(portBlock![0]).toContain('no-spinner');
  });

  it('the port input prevents accidental wheel-increment', () => {
    // The same block carries onWheel that blurs the input so a
    // scroll over the focused field doesn't silently change the value.
    const portBlock = SETTINGS_SRC.match(/id=\{portId\}[\s\S]*?\/>/);
    expect(portBlock, 'port input self-close not found').toBeTruthy();
    expect(portBlock![0]).toMatch(/onWheel=/);
    expect(portBlock![0]).toMatch(/\.blur\(\)/);
  });

  it('globals.css defines the .no-spinner utility', () => {
    expect(GLOBALS_SRC).toContain('.no-spinner');
    expect(GLOBALS_SRC).toContain('-moz-appearance: textfield');
    expect(GLOBALS_SRC).toContain('-webkit-appearance: none');
  });
});
