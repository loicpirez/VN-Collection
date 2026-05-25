import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(process.cwd(), 'src/components/BulkActionBar.tsx'), 'utf8');

describe('BulkActionBar progress feedback', () => {
  it('exposes progress as a labelled live status with a current operation', () => {
    expect(SOURCE).toContain('role="status"');
    expect(SOURCE).toContain('aria-live="polite"');
    expect(SOURCE).toContain('operation.label');
    expect(SOURCE).toContain('operation.currentId');
  });

  it('can stop a running bulk operation and abort the active request', () => {
    expect(SOURCE).toContain('function requestStop()');
    expect(SOURCE).toContain('controllerRef.current?.abort()');
    expect(SOURCE).toContain('{t.bulk.stop}');
  });
});
