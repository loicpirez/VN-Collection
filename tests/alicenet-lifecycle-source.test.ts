import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CLIENT = readFileSync('src/components/AliceNetClient.tsx', 'utf8');
const DIALOG = readFileSync('src/components/alicenet/AliceNetLinkDialog.tsx', 'utf8');

describe('AliceNet lifecycle', () => {
  it('owns page reloads and aborts every active channel on teardown', () => {
    expect(CLIENT).toContain('const loadAbortRef = useRef<AbortController | null>(null)');
    expect(CLIENT).toContain('loadAbortRef.current?.abort()');
    expect(CLIENT).toContain('activeOpAbortRef.current?.abort()');
    expect(CLIENT).toContain('bulkAbortRef.current?.abort()');
    expect(CLIENT).toContain('resetAbortRef.current?.abort()');
    expect(CLIENT).toContain('clearAbortRef.current?.abort()');
  });

  it('locks pipeline and bulk work synchronously and wires Stop to cancellation', () => {
    expect(CLIENT).toContain('if (opInFlightRef.current) return null');
    expect(CLIENT).toContain('if (bulkInFlightRef.current) return');
    expect(CLIENT).toContain('activeOpAbortRef.current?.abort()');
    expect(CLIENT).toContain('bulkAbortRef.current?.abort()');
    expect(CLIENT).toContain("signal: controller.signal");
    expect(CLIENT).toContain('if (!ownsOp(token) || stopRef.current) return');
    expect(CLIENT).toContain('if (!ownsBulk(token)) return');
  });

  it('locks row actions and candidate remaps before network work', () => {
    expect(CLIENT).toContain('if (resetInFlightRef.current) return');
    expect(CLIENT).toContain('if (clearInFlightRef.current) return');
    expect(CLIENT).toContain('setBusy(vnId)');
    expect(CLIENT).toContain('disabled={busy != null || isActive}');
    expect(CLIENT).toContain('codeRef.current !== owner');
  });

  it.each([
    ['automatic-match reset', 'async function resetAutoMatches()', 'resetAbortRef.current = controller'],
    ['row-link clear', 'async function clearLink(code: string)', 'clearAbortRef.current = controller'],
  ])('reserves %s cancellation ownership before awaiting confirmation', (_label, start, acquire) => {
    const body = CLIENT.slice(CLIENT.indexOf(start));
    expect(body.indexOf(acquire)).toBeLessThan(body.indexOf('await confirm('));
  });

  it('reseeds the reusable remap dialog and rejects stale search or link completions', () => {
    expect(DIALOG).toContain('const itemCodeRef = useRef(item.code)');
    expect(DIALOG).toContain('setQuery(initialQuery(item))');
    expect(DIALOG).toContain('mutationAbortRef.current?.abort()');
    expect(DIALOG).toContain('if (mutationInFlightRef.current) return');
    expect(DIALOG).toContain('itemCodeRef.current !== owner');
    expect(DIALOG).toContain('mutationAbortRef.current !== controller');
  });
});
