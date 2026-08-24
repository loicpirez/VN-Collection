import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const settings = readFileSync('src/components/SettingsButton.tsx', 'utf8');
const layout = readFileSync('src/components/settings/LayoutSettingsTab.tsx', 'utf8');

describe('settings layout bundle boundary', () => {
  it('keeps layout customization and dnd-kit behind the lazy settings tab', () => {
    expect(settings).toContain("import('./settings/LayoutSettingsTab')");
    expect(settings).toContain('ssr: false');
    expect(settings).not.toContain("from '@dnd-kit/");
    expect(layout).toContain("from '@dnd-kit/core'");
    expect(layout).toContain("from '@dnd-kit/sortable'");
    expect(layout).toContain("from '@dnd-kit/utilities'");
  });
});
