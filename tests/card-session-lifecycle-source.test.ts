import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CARD = readFileSync('src/components/VnCard.tsx', 'utf8');
const MENU = readFileSync('src/components/CardContextMenu.tsx', 'utf8');
const PANEL = readFileSync('src/components/SessionPanel.tsx', 'utf8');
const TIMER = readFileSync('src/components/PomodoroTimer.tsx', 'utf8');

describe('card and VN session identity lifecycle', () => {
  it('reseeds recycled card state and owns add-to-collection completion', () => {
    expect(CARD).toContain('const identityRef = useRef<string | null>(data.id)');
    expect(CARD).toContain('setAddedLocal(false)');
    expect(CARD).toContain('setMenuAnchor(null)');
    expect(CARD).toContain('const ownerVnId = data.id');
    expect(CARD).toContain('if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return');
    expect(CARD).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(CARD).toContain('mutationAbortRef.current?.abort()');
    expect(CARD).toContain('signal: controller.signal');
  });

  it('reseeds context-menu favorites and owns patch completion', () => {
    expect(MENU).toContain('const identityRef = useRef<string | null>(vnId)');
    expect(MENU).toContain('setFavLocal(favorite)');
    expect(MENU).toContain('const ownerVnId = vnId');
    expect(MENU).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(MENU).toContain('mutationAbortRef.current?.abort()');
    expect(MENU).toContain('signal: controller.signal');
    expect(MENU).toContain('if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return');
    expect(MENU).toContain("patch({ favorite: next }, 'favorite', () => setFavLocal(previous))");
  });

  it('resets lifted and timer-local elapsed state when the VN changes', () => {
    expect(PANEL).toContain('useEffect(() => setElapsedMin(0), [vnId])');
    expect(TIMER).toContain('const identityRef = useRef<string | null>(vnId)');
    expect(TIMER).toContain('setStartedAt(null)');
    expect(TIMER).toContain('const ownerCurrentMinutes = currentMinutes');
    expect(TIMER).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(TIMER).toContain('mutationAbortRef.current?.abort()');
    expect(TIMER).toContain('signal: controller.signal');
    expect(TIMER).toContain('mutationAbortRef.current !== controller || controller.signal.aborted');
    expect(TIMER).toContain('<Timer className="h-3 w-3 text-accent" aria-hidden />');
    expect(TIMER).toContain('<Plus className="h-3 w-3" aria-hidden />');
  });

  it('reserves Pomodoro logging ownership before awaiting confirmation', () => {
    const logStart = TIMER.indexOf('async function logElapsed()');
    const body = TIMER.slice(logStart);
    expect(body.indexOf('mutationAbortRef.current = controller')).toBeLessThan(body.indexOf('await confirm('));
  });
});
