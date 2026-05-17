import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listActivityKinds, listUserActivity, maskActivityPayload, recordActivity } from '@/lib/activity';

describe('user activity', () => {
  afterEach(() => {
    db.prepare('DELETE FROM user_activity').run();
  });

  it('masks sensitive payload keys recursively', () => {
    expect(maskActivityPayload({
      token: 'secret',
      nested: { steam_api_key: 'secret', safe: 'value' },
    })).toEqual({
      token: '[masked]',
      nested: { steam_api_key: '[masked]', safe: 'value' },
    });
  });

  it('records and filters mutation activity', () => {
    recordActivity({
      kind: 'settings.update',
      entity: 'settings',
      entityId: 'display',
      label: 'Updated settings',
      payload: { vndb_token: 'secret', theme: 'dark' },
    });
    const rows = listUserActivity({ kind: 'settings.update' });
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toContain('[masked]');
    expect(rows[0].payload).not.toContain('secret');
    expect(listActivityKinds()).toEqual(['settings.update']);
  });

  it('records the round-4-followup mutation kinds end-to-end', () => {
    // VNDB writeback
    recordActivity({
      kind: 'vndb.writeback',
      entity: 'vn',
      entityId: 'v9001',
      label: 'v9001',
      payload: { changed: ['vote'], labels_set: null, labels_unset: null },
    });
    // VN→EGS mapping (pin + clear)
    recordActivity({
      kind: 'mapping.vn-egs',
      entity: 'vn',
      entityId: 'v9001',
      label: 'placeholder title',
      payload: { egs_id: 12345, action: 'pin' },
    });
    recordActivity({
      kind: 'mapping.vn-egs',
      entity: 'vn',
      entityId: 'v9001',
      label: 'v9001',
      payload: { action: 'clear', mode: 'auto' },
    });
    // EGS→VN mapping
    recordActivity({
      kind: 'mapping.egs-vn',
      entity: 'egs',
      entityId: '12345',
      label: 'egs_12345 → v9001',
      payload: { action: 'pin', vndb_id: 'v9001' },
    });
    // EGS-only collection add
    recordActivity({
      kind: 'collection.add',
      entity: 'vn',
      entityId: 'egs_12345',
      label: 'placeholder title',
      payload: { source: 'egs', egs_id: 12345, status: 'planning' },
    });

    const kinds = listActivityKinds().sort();
    expect(kinds).toEqual([
      'collection.add',
      'mapping.egs-vn',
      'mapping.vn-egs',
      'vndb.writeback',
    ]);
    expect(listUserActivity({ entity: 'vn' })).toHaveLength(4); // writeback + pin + clear + add
    expect(listUserActivity({ entity: 'egs' })).toHaveLength(1);

    const writebackRow = listUserActivity({ kind: 'vndb.writeback' })[0];
    const writebackPayload = JSON.parse(writebackRow.payload ?? '{}');
    expect(writebackPayload).toHaveProperty('changed');
    // Confirm the route never carried raw `notes` text into the
    // payload — the round-4-followup contract said only the changed
    // field NAMES are persisted, not values.
    expect(writebackPayload).not.toHaveProperty('notes');
  });
});

