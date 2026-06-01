import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const button = readFileSync('src/components/DumpIgnoreButton.tsx', 'utf8');
const page = readFileSync('src/app/dumped/page.tsx', 'utf8');
const form = readFileSync('src/components/EditForm.tsx', 'utf8');

describe('dump-tracker ignore preference', () => {
  it('keeps ignored rows recoverable from an explicit route-state tab', () => {
    expect(page).toContain("type DumpTab = 'all' | 'complete' | 'missing' | 'none' | 'ignored'");
    expect(page).toContain("if (e.dumped_ignored) return 'ignored'");
    expect(page).toContain('<DumpIgnoreButton vnId={e.vn_id} ignored={e.dumped_ignored} />');
  });

  it('owns card mutations and aborts them on identity replacement or teardown', () => {
    expect(button).toContain('mutationAbortRef.current?.abort()');
    expect(button).toContain('mutationInFlightRef.current = true');
    expect(button).toContain('signal: controller.signal');
    expect(button).toContain('mutationAbortRef.current !== controller');
    expect(button).toContain('controller.signal.aborted');
  });

  it('includes the preference in same-route EditForm hydration and autosave', () => {
    expect(form).toContain('dumpedIgnored: !!vn.dumped_ignored');
    expect(form).toContain('dumped_ignored: dmpIgnored');
    expect(form).toContain('setDumpedIgnored(next.dumpedIgnored)');
    expect(form).toContain('dumpedIgnored={dumpedIgnored}');
  });
});
