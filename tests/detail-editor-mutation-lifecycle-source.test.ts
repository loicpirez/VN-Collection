import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');
const SYNOPSIS = source('src/components/CustomSynopsis.tsx');
const ACTIVITY = source('src/components/ActivityTimeline.tsx');
const GAME_LOG = source('src/components/GameLog.tsx');

describe('VN detail editor mutation lifecycle', () => {
  it.each([
    ['custom synopsis', SYNOPSIS],
    ['activity timeline', ACTIVITY],
    ['game log', GAME_LOG],
  ])('owns and aborts %s writes', (_label, body) => {
    expect(body).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(body).toContain('const mutationInFlightRef = useRef(false)');
    expect(body).toContain('mutationAbortRef.current?.abort()');
    expect(body).toContain('signal: controller.signal');
    expect(body).toContain('if (!ownsMutation(ownerVnId, controller)) return');
  });

  it.each([
    ['custom synopsis', SYNOPSIS, 'const controller = beginMutation()'],
    ['activity timeline', ACTIVITY, 'const controller = beginMutation()'],
    ['game log', GAME_LOG, "const controller = beginMutation('remove')"],
  ])('reserves the %s destructive owner before awaiting confirmation', (_label, body, acquire) => {
    const removeStart = body.indexOf('async function clear()') >= 0
      ? body.indexOf('async function clear()')
      : body.indexOf('async function remove(id: number)');
    const removeBody = body.slice(removeStart);
    expect(removeBody.indexOf(acquire)).toBeLessThan(removeBody.indexOf('await confirm('));
    expect(removeBody).toContain('!ownsMutation(ownerVnId, controller)');
  });

  it('serializes game-log add, edit, and delete through one channel', () => {
    expect(GAME_LOG).toContain("const controller = beginMutation('add')");
    expect(GAME_LOG).toContain("const controller = beginMutation('edit')");
    expect(GAME_LOG).toContain("const controller = beginMutation('remove')");
    expect(GAME_LOG).toContain('const ownerEditingId = editingId');
  });

  it('uses plain shared metadata separators and missing-value tokens', () => {
    expect(SYNOPSIS).toContain('{label} / {t.customSynopsis.editing}');
    expect(SYNOPSIS).toContain('{text.length} / 8000 / {t.customSynopsis.hint}');
    expect(ACTIVITY).toContain("String(p.from ?? '-')");
    expect(ACTIVITY).toContain("if (typeof v !== 'number') return '-';");
    expect(GAME_LOG).toContain('<span className="opacity-70">/</span>');
  });
});
