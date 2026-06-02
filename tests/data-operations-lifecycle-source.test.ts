import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const EGS = readFileSync('src/components/EgsSyncBlock.tsx', 'utf8');
const MAINTENANCE = readFileSync('src/components/DataMaintenance.tsx', 'utf8');

describe('data operations lifecycle', () => {
  it('guards EGS config and sync operations after teardown', () => {
    expect(EGS).toContain('const mountedRef = useRef(true)');
    expect(EGS).toContain('const usernameSaveRef = useRef(false)');
    expect(EGS).toContain('const syncInFlightRef = useRef(false)');
    expect(EGS).toContain('const usernameAbortRef = useRef<AbortController | null>(null)');
    expect(EGS).toContain('const syncAbortRef = useRef<AbortController | null>(null)');
    expect(EGS).toContain('if (usernameSaveRef.current) return');
    expect(EGS).toContain('if (syncInFlightRef.current) return');
    expect(EGS).toContain('if (!mountedRef.current || usernameAbortRef.current !== controller || controller.signal.aborted) return');
    expect(EGS).toContain('usernameAbortRef.current !== controller || controller.signal.aborted');
    expect(EGS).toContain('syncAbortRef.current !== controller || controller.signal.aborted');
    expect(EGS).toContain('signal: controller.signal');
  });

  it('keeps newer username edits dirty after an older value saves', () => {
    expect(EGS).toContain('const usernameDirtyRef = useRef(false)');
    expect(EGS).toContain('!mountedRef.current || usernameDirtyRef.current');
    expect(EGS).toContain('const ownerUsername = usernameRef.current.trim() || null');
    expect(EGS).toContain("if ((usernameRef.current.trim() || null) === ownerUsername) {");
    expect(EGS).toContain('usernameDirtyRef.current = false');
    expect(EGS).toContain('setUsernameDirty(false)');
  });

  it('owns maintenance reloads and locks per-row refresh work', () => {
    expect(MAINTENANCE).toContain('const loadAbortRef = useRef<AbortController | null>(null)');
    expect(MAINTENANCE).toContain('const refreshAbortRef = useRef<AbortController | null>(null)');
    expect(MAINTENANCE).toContain('loadAbortRef.current?.abort()');
    expect(MAINTENANCE).toContain('loadAbortRef.current !== controller');
    expect(MAINTENANCE).toContain('if (refreshingRef.current) return');
    expect(MAINTENANCE).toContain('if (!mountedRef.current || controller.signal.aborted) return');
  });

  it('uses ASCII metadata and hides decorative operation glyphs', () => {
    expect(EGS).toContain("{ fallback: '-', emptyValue: 'allow_zero' }");
    expect(EGS).not.toContain("fallback: '—'");
    expect(EGS).toContain('<Save className="h-4 w-4" aria-hidden />');
    expect(MAINTENANCE).toContain('>/ {dups.length}</span>');
    expect(MAINTENANCE).toContain('<Copy className="h-3 w-3" aria-hidden />');
    expect(MAINTENANCE).not.toContain('·');
  });
});
