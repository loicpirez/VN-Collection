import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('dialog and sync accessibility', () => {
  it('gives LinkToVndbButton dialog semantics and focus management', () => {
    const src = source('src/components/LinkToVndbButton.tsx');
    expect(src).toContain('useDialogA11y');
    expect(src).toContain('role="dialog"');
    expect(src).toContain('aria-modal="true"');
    expect(src).toContain('aria-labelledby={titleId}');
  });

  it('makes EGS sync suggestions keyboard reachable', () => {
    const src = source('src/components/EgsSyncBlock.tsx');
    expect(src).toContain('aria-label={t.egsSync.usernamePlaceholder}');
    expect(src).toContain('aria-pressed={picked}');
    expect(src).toContain('togglePick(s.vn_id)');
  });
});
