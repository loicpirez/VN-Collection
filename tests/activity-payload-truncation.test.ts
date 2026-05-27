/**
 * Verifies that `recordActivity` truncates payloads over
 * `ACTIVITY_PAYLOAD_MAX_BYTES` (8 KB) to a `{ truncated: true, size: N }`
 * stub before writing to `user_activity`. Without this guard a runaway
 * EGS scrape or import could write multi-megabyte JSON blobs into a
 * single audit row.
 *
 * Pinned via test so the cap can't silently disappear in a future
 * refactor — the cap is the only thing keeping the audit table
 * bounded in size.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { recordActivity, listUserActivity } from '@/lib/activity';

function clearActivity(): void {
  db.prepare('DELETE FROM user_activity').run();
}

describe('recordActivity — payload truncation', () => {
  beforeEach(() => clearActivity());

  it('writes a small payload as-is (under 8 KB)', () => {
    recordActivity({
      kind: 'test.small',
      entity: 'vn',
      entityId: 'v90001',
      payload: { key: 'value', n: 42 },
    });
    const rows = listUserActivity({ kind: 'test.small' });
    expect(rows.length).toBe(1);
    const parsed = JSON.parse(rows[0].payload as string);
    expect(parsed.key).toBe('value');
    expect(parsed.n).toBe(42);
    expect(parsed.truncated).toBeUndefined();
  });

  it('replaces a payload over the cap with a truncated stub', () => {
    // 9 KB of content — well above the 8 KB cap.
    const oversized = { junk: 'x'.repeat(9 * 1024) };
    recordActivity({
      kind: 'test.large',
      entity: 'vn',
      entityId: 'v90002',
      payload: oversized,
    });
    const rows = listUserActivity({ kind: 'test.large' });
    expect(rows.length).toBe(1);
    const parsed = JSON.parse(rows[0].payload as string);
    expect(parsed.truncated).toBe(true);
    expect(typeof parsed.size).toBe('number');
    // The recorded payload itself must be well under 8 KB (it's a stub
    // with `{ truncated: true, size: <large> }` only).
    expect((rows[0].payload as string).length).toBeLessThan(100);
    // And the reported size must reflect the original payload's size.
    expect(parsed.size).toBeGreaterThan(8 * 1024);
  });

  it('persists null payloads as null (no JSON wrapping)', () => {
    recordActivity({
      kind: 'test.null',
      entity: 'vn',
      entityId: 'v90003',
    });
    const rows = listUserActivity({ kind: 'test.null' });
    expect(rows.length).toBe(1);
    expect(rows[0].payload).toBeNull();
  });

  it('honours the VNCOLL_DISABLE_ACTIVITY kill switch', () => {
    const previous = process.env.VNCOLL_DISABLE_ACTIVITY;
    process.env.VNCOLL_DISABLE_ACTIVITY = '1';
    try {
      recordActivity({
        kind: 'test.disabled',
        entity: 'vn',
        entityId: 'v90004',
        payload: { ignored: true },
      });
      const rows = listUserActivity({ kind: 'test.disabled' });
      expect(rows.length).toBe(0);
    } finally {
      if (previous !== undefined) process.env.VNCOLL_DISABLE_ACTIVITY = previous;
      else delete process.env.VNCOLL_DISABLE_ACTIVITY;
    }
  });

  it('drops rows with an empty kind string', () => {
    recordActivity({
      kind: '   ',
      entity: 'vn',
      entityId: 'v90005',
      payload: { ignored: true },
    });
    const rows = db.prepare("SELECT * FROM user_activity WHERE entity_id = 'v90005'").all();
    expect(rows.length).toBe(0);
  });
});
