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
});

