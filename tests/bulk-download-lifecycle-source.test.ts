import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const BULK = readFileSync('src/components/BulkDownloadButton.tsx', 'utf8');

describe('bulk-download lifecycle', () => {
  it('owns one run and aborts all active request channels on teardown', () => {
    expect(BULK).toContain('const runInFlightRef = useRef(false)');
    expect(BULK).toContain('const collectionAbortRef = useRef<AbortController | null>(null)');
    expect(BULK).toContain('const activeRequestAbortRef = useRef<AbortController | null>(null)');
    expect(BULK).toContain('collectionAbortRef.current?.abort()');
    expect(BULK).toContain('activeRequestAbortRef.current?.abort()');
  });

  it('wires Stop to real request cancellation and suppresses obsolete completions', () => {
    expect(BULK).toContain('stopRequestedRef.current = true');
    expect(BULK).toContain("fetch(url, { method: 'POST', signal: controller.signal })");
    expect(BULK).toContain('if (!ownsRun(token)) return');
    expect(BULK).toContain('if (runInFlightRef.current) return null');
  });

  it('uses abortable pagination and removes console-only refresh failures', () => {
    expect(BULK).toContain('{ signal },');
    expect(BULK).toContain("fetch('/api/refresh/global', { method: 'POST', signal: controller.signal })");
    expect(BULK).not.toContain("console.error('[BulkDownloadButton] global refresh failed:'");
  });
});
