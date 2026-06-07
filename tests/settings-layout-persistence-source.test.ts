import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SETTINGS = readFileSync('src/components/SettingsButton.tsx', 'utf8');
const LAYOUT = readFileSync('src/components/settings/LayoutSettingsTab.tsx', 'utf8');

describe('settings layout persistence contract', () => {
  it('serializes setting writes and reports explicit outcomes', () => {
    expect(SETTINGS).toContain('export type SaveServer = (patch: ServerSettingsPatch) => Promise<boolean>');
    expect(SETTINGS).toContain('const saveQueueRef = useRef<Promise<void>>(Promise.resolve())');
    expect(SETTINGS).toContain('const task = saveQueueRef.current.then(async () =>');
    expect(SETTINGS).toContain('saveQueueRef.current = task.then(() => undefined)');
    expect(SETTINGS).toContain('return true');
    expect(SETTINGS).toContain('return false');
  });

  it('guards settings reads against superseded requests', () => {
    expect(SETTINGS).toContain('loadAbortRef.current === ac && !ac.signal.aborted');
  });

  it('owns queued writes and VNDB pull-status work across teardown', () => {
    expect(SETTINGS).toContain('const mountedRef = useRef(true)');
    expect(SETTINGS).toContain('const saveAbortRef = useRef<AbortController | null>(null)');
    expect(SETTINGS).toContain('const pullAbortRef = useRef<AbortController | null>(null)');
    expect(SETTINGS).toContain('const pullInFlightRef = useRef(false)');
    expect(SETTINGS).toContain('if (!mountedRef.current) return false');
    expect(SETTINGS).toContain('saveAbortRef.current !== controller || controller.signal.aborted');
    expect(SETTINGS).toContain('if (pullInFlightRef.current) return');
    expect(SETTINGS).toContain("fetch('/api/vndb/pull-statuses', { method: 'POST', signal: controller.signal })");
    expect(SETTINGS).toContain('pullAbortRef.current !== controller || controller.signal.aborted');
  });

  it('uses ASCII metadata separators and localized backup default copy', () => {
    expect(SETTINGS).toContain("{c.from ?? '-'}");
    expect(SETTINGS).toContain('<span className="ml-1">/ {u.status}</span>');
    expect(SETTINGS).toContain('` / ${t.settings.vndbBackupDefaultSuffix}`');
    expect(SETTINGS).not.toContain("{c.from ?? '—'}");
  });

  it('broadcasts home and detail layouts only after confirmed persistence', () => {
    expect(LAYOUT).toContain('const saved = await onChange(patch)');
    expect(LAYOUT).toContain('const saved = await onSave(next)');
    expect(LAYOUT).toContain('} else if (revisionRef.current === revision) {');
    expect(LAYOUT).toContain('setDraft(layout)');
  });
});
