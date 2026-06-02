import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

  it('reserves a stable density track so sliders cannot overlap spacing presets', () => {
    expect(SOURCE).toContain('xl:grid-cols-[minmax(8rem,0.7fr)_minmax(20rem,1.3fr)_minmax(20rem,1fr)]');
    expect(SOURCE).toContain('grid w-full max-w-[20rem] grid-cols-[44px_minmax(4rem,1fr)_44px_2.5rem_44px]');
    expect(SOURCE).toContain('h-1.5 min-w-0 w-full cursor-pointer accent-accent');
  });
});
