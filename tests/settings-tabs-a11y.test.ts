/**
 * R5-102 — pin the tablist / tab / tabpanel a11y wiring in
 * `SettingsButton`. The previous shape carried `role="tab"` +
 * `aria-selected` on each tab button but no `aria-controls`
 * pointing at the matching panel, and the conditional
 * `{activeTab === 'foo' && (<div className="...">…</div>)}` blocks
 * were plain `<div>`s with no `role="tabpanel"` /
 * `aria-labelledby`. Screen readers therefore announced the tab
 * change as a `button[aria-selected=true]` toggle, not as a tab
 * navigating into a panel.
 *
 * After the fix:
 *   - Each `<button role="tab">` has `id="settings-tab-<id>"` +
 *     `aria-controls="settings-panel-<id>"` + roving `tabIndex`
 *     (active=0, others=-1).
 *   - Each conditional branch's outer `<div>` carries
 *     `role="tabpanel"`, `id="settings-panel-<id>"`, and
 *     `aria-labelledby="settings-tab-<id>"`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(__dirname, '..', 'src/components/SettingsButton.tsx'),
  'utf8',
);

const SETTINGS_TABS = [
  'display',
  'content',
  'library',
  'home',
  'vn-page',
  'account',
  'integrations',
  'automation',
] as const;

describe('SettingsButton — R5-102 tablist / tab a11y attributes', () => {
  it('every tab button carries id + aria-controls + roving tabIndex', () => {
    // Find the <button> that has `role="tab"` — anchor on `<button`
    // and capture through to the opening `>` so all of its attrs
    // are inside the match group (id can be BEFORE role).
    const buttonBlock = SOURCE.match(/<button\b[^>]*?role="tab"[\s\S]*?>/);
    expect(buttonBlock, 'tab button block must exist').not.toBeNull();
    expect(buttonBlock![0]).toMatch(/id=\{`settings-tab-\$\{tab\}`\}/);
    expect(buttonBlock![0]).toMatch(/aria-controls=\{`settings-panel-\$\{tab\}`\}/);
    expect(buttonBlock![0]).toMatch(/tabIndex=\{active \? 0 : -1\}/);
  });
});

describe('SettingsButton — R5-102 every tabpanel branch has the right ARIA', () => {
  for (const tab of SETTINGS_TABS) {
    it(`'${tab}' branch is wrapped in role=tabpanel + aria-labelledby`, () => {
      // Lift the literal `activeTab === '<tab>' && (` block plus
      // its first wrapper element (up to the first `>` of the
      // `<div ...>`). We assert the div has the three required
      // attributes.
      const re = new RegExp(
        `activeTab === '${tab}' && \\(\\s*<div\\s+([\\s\\S]*?)>`,
      );
      const m = SOURCE.match(re);
      expect(m, `branch for '${tab}' must open a <div>`).not.toBeNull();
      const attrs = m![1];
      expect(attrs, `'${tab}' panel must have role="tabpanel"`).toMatch(/role="tabpanel"/);
      expect(attrs, `'${tab}' panel must have id="settings-panel-${tab}"`).toMatch(new RegExp(`id="settings-panel-${tab}"`));
      expect(attrs, `'${tab}' panel must have aria-labelledby="settings-tab-${tab}"`).toMatch(new RegExp(`aria-labelledby="settings-tab-${tab}"`));
    });
  }
});
