import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LAYOUT_SOURCE = readFileSync(
  join(process.cwd(), 'src/components/settings/LayoutSettingsTab.tsx'),
  'utf8',
);

const SOURCE = [
  'src/components/SettingsButton.tsx',
  'src/components/settings/LayoutSettingsTab.tsx',
  'src/components/settings/IntegrationsSettingsTab.tsx',
]
  .map((rel) => readFileSync(join(process.cwd(), rel), 'utf8'))
  .join('\n');

describe('Settings per-page layout panel', () => {
  it('renders a skeleton while client layout settings hydrate', () => {
    expect(SOURCE).toMatch(/import \{ SkeletonBlock \} from '\.\.?\/Skeleton'/);
    expect(SOURCE).toContain('if (!hydrated)');
    expect(SOURCE).toContain('aria-busy="true"');
  });

  it('keeps the VNDB token save action visibly busy and disabled during save', () => {
    expect(SOURCE).toContain('const [savingToken, setSavingToken] = useState(false)');
    expect(SOURCE).toContain('disabled={savingToken || !tokenInput.trim()}');
    expect(SOURCE).toContain('savingToken ? <Loader2');
  });

  it('uses fixed density presets without an overlapping range control', () => {
    expect(SOURCE).toContain('lg:grid-cols-[minmax(7rem,auto)_minmax(0,1fr)]');
    expect(SOURCE).toContain('min-w-0 space-y-2');
    expect(SOURCE).toContain('border-t border-border/40 pt-2');
    expect(LAYOUT_SOURCE).toContain('CARD_DENSITY_PRESETS.map');
    expect(LAYOUT_SOURCE).not.toContain('type="range"');
  });
});
