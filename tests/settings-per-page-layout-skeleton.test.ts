import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(process.cwd(), 'src/components/SettingsButton.tsx'), 'utf8');

describe('Settings per-page layout panel', () => {
  it('renders a skeleton while client layout settings hydrate', () => {
    expect(SOURCE).toContain("import { SkeletonBlock } from './Skeleton'");
    expect(SOURCE).toContain('if (!hydrated)');
    expect(SOURCE).toContain('aria-busy="true"');
  });

  it('keeps the VNDB token save action visibly busy and disabled during save', () => {
    expect(SOURCE).toContain('const [savingToken, setSavingToken] = useState(false)');
    expect(SOURCE).toContain('disabled={savingToken || !tokenInput.trim()}');
    expect(SOURCE).toContain('savingToken ? <Loader2');
  });
});
