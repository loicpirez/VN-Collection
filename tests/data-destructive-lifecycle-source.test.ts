import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CACHE = readFileSync('src/components/CachePanel.tsx', 'utf8');
const IMPORT = readFileSync('src/components/ImportPanel.tsx', 'utf8');
const DROP = readFileSync('src/components/DropImport.tsx', 'utf8');

describe('data destructive operation lifecycle', () => {
  it('owns cache reads and locks cleanup from confirmation through reload', () => {
    expect(CACHE).toContain('const loadAbortRef = useRef<AbortController | null>(null)');
    expect(CACHE).toContain('const clearInFlightRef = useRef(false)');
    expect(CACHE).toContain('const clearAbortRef = useRef<AbortController | null>(null)');
    expect(CACHE).toContain('loadAbortRef.current !== controller');
    expect(CACHE).toContain('if (clearInFlightRef.current) return');
    expect(CACHE).toContain('clearAbortRef.current?.abort()');
    expect(CACHE).toContain('signal: controller.signal');
    expect(CACHE).toContain('clearAbortRef.current === controller');
    expect(CACHE).toContain("onClick={() => clearAll('all', true)}");
    expect(CACHE).toContain('<RefreshCw className="h-4 w-4" aria-hidden />');
    expect(CACHE).toContain('<Trash2 className="h-4 w-4" aria-hidden />');
  });

  it('aborts obsolete panel uploads and restore confirmations', () => {
    expect(IMPORT).toContain('const mountedRef = useRef(true)');
    expect(IMPORT).toContain('uploadCtrlRef.current?.abort()');
    expect(IMPORT).toContain('uploadCtrlRef.current !== ctrl');
    expect(IMPORT).toContain("signal: ctrl.signal");
  });

  it('locks global drops and aborts uploads on teardown', () => {
    expect(DROP).toContain('const uploadInFlightRef = useRef(false)');
    expect(DROP).toContain('if (uploadInFlightRef.current) return');
    expect(DROP).toContain('uploadCtrlRef.current?.abort()');
    expect(DROP).toContain("signal: ctrl.signal");
    expect(DROP).toContain('mountedRef.current = false');
  });
});
