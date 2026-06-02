import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const GOAL = readFileSync('src/components/ReadingGoalCard.tsx', 'utf8');
const SERIES = readFileSync('src/components/SeriesManager.tsx', 'utf8');

describe('tracking and series registry lifecycle', () => {
  it('owns reading-goal reads and writes by year', () => {
    expect(GOAL).toContain('const identityRef = useRef<number | null>(year)');
    expect(GOAL).toContain('const saveAbortRef = useRef<AbortController | null>(null)');
    expect(GOAL).toContain('const saveInFlightRef = useRef(false)');
    expect(GOAL).toContain('const ownerYear = year');
    expect(GOAL).toContain('if (ac.signal.aborted || identityRef.current !== ownerYear) return');
    expect(GOAL).toContain('signal: controller.signal');
    expect(GOAL).toContain('saveAbortRef.current?.abort()');
    expect(GOAL).toContain('saveAbortRef.current !== controller || controller.signal.aborted');
    expect(GOAL).toContain('identityRef.current === ownerYear && saveAbortRef.current === controller');
    expect(GOAL).toContain('identityRef.current = null');
    expect(GOAL).toContain('<Target className="h-5 w-5 text-accent" aria-hidden />');
  });

  it('invalidates registry work after teardown and locks mutations in flight', () => {
    expect(SERIES).toContain('const [busy, setBusy] = useState<string | null>(null)');
    expect(SERIES).toContain('const mountedRef = useRef(true)');
    expect(SERIES).toContain('const busyRef = useRef(false)');
    expect(SERIES).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(SERIES).toContain('if (busyRef.current) return');
    expect(SERIES).toContain('busyRef.current = true');
    expect(SERIES).toContain('busyRef.current = false');
    expect(SERIES).toContain('if (!mountedRef.current || mutationAbortRef.current !== controller || controller.signal.aborted) return');
    expect(SERIES).toContain('mutationAbortRef.current !== controller || controller.signal.aborted');
    expect(SERIES).toContain('signal: controller.signal');
    expect(SERIES).toContain('if (mutationAbortRef.current === controller)');
  });

  it('reserves series deletion before awaiting confirmation', () => {
    const removeStart = SERIES.indexOf('async function remove(id: number)');
    const body = SERIES.slice(removeStart);
    expect(body.indexOf('busyRef.current = true')).toBeLessThan(body.indexOf('await confirm('));
    expect(body.indexOf('mutationAbortRef.current = controller')).toBeLessThan(body.indexOf('await confirm('));
  });
});
