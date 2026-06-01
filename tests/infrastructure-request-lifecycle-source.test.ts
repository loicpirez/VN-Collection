import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HOME = readFileSync('src/components/HomeLayoutEditorTrigger.tsx', 'utf8');
const EXPORT = readFileSync('src/components/ExportGameListButton.tsx', 'utf8');
const STATUS = readFileSync('src/components/DownloadStatusBar.tsx', 'utf8');

describe('infrastructure request lifecycle', () => {
  it('removes the dead home-layout id import and disables sorting during persistence', () => {
    expect(HOME).not.toContain('HOME_SECTION_IDS');
    expect(HOME).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(HOME).toContain('disabled: busy');
    expect(HOME).toContain('disabled={busy}');
  });

  it('owns export generation across rapid clicks and teardown', () => {
    expect(EXPORT).toContain('const mountedRef = useRef(true)');
    expect(EXPORT).toContain('const exportAbortRef = useRef<AbortController | null>(null)');
    expect(EXPORT).toContain('const exportInFlightRef = useRef(false)');
    expect(EXPORT).toContain('if (exportInFlightRef.current) return');
    expect(EXPORT).toContain('signal: controller.signal');
    expect(EXPORT).toContain('exportAbortRef.current !== controller || controller.signal.aborted');
  });

  it('owns fallback status polling and cancels it when SSE resumes', () => {
    expect(STATUS).toContain('let pollAbort: AbortController | null = null');
    expect(STATUS).toContain('pollAbort?.abort()');
    expect(STATUS).toContain("fetch('/api/download-status', { cache: 'no-store', signal: controller.signal })");
    expect(STATUS).toContain('pollAbort === controller && !controller.signal.aborted && next');
    expect(STATUS).toContain('pollAbort !== controller || controller.signal.aborted');
  });

  it('uses ASCII status separators and hides decorative status glyphs', () => {
    expect(STATUS).not.toContain('·');
    expect(STATUS).not.toContain('–');
    expect(STATUS).toContain('<Cloud className="h-4 w-4 shrink-0" aria-hidden />');
    expect(STATUS).toContain('<AlertTriangle className="mr-1 inline-block h-2.5 w-2.5" aria-hidden />');
    expect(HOME).toContain('<X className="h-4 w-4" aria-hidden />');
  });
});
