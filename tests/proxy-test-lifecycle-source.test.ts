import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync('src/components/settings/IntegrationsSettingsTab.tsx', 'utf8');

describe('proxy settings test lifecycle', () => {
  it('owns proxy tests with a synchronous abortable generation', () => {
    expect(SOURCE).toContain('const testAbortRef = useRef<AbortController | null>(null)');
    expect(SOURCE).toContain('const testInFlightRef = useRef(false)');
    expect(SOURCE).toContain('if (testInFlightRef.current) return');
    expect(SOURCE).toContain('testAbortRef.current?.abort()');
    expect(SOURCE).toContain('testAbortRef.current !== controller');
    expect(SOURCE).toContain('signal: controller.signal');
  });

  it('uses an ASCII provider heading separator', () => {
    expect(SOURCE).toContain('{t.settings.proxyTitle} / {label}');
    expect(SOURCE).not.toContain('{t.settings.proxyTitle} · {label}');
  });
});
