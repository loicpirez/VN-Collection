import { describe, expect, it, beforeEach } from 'vitest';
import { db, getAppSetting, setAppSetting } from '../src/lib/db';

describe('app_setting_audit preview hardening', () => {
  beforeEach(() => {
    db.exec('DELETE FROM app_setting');
    db.exec('DELETE FROM app_setting_audit');
  });

  it('vndb_token preview is masked to the last 4 chars', () => {
    setAppSetting('vndb_token', 'AAAAAAAAAAAAAAAABCDE');
    const rows = db
      .prepare(`SELECT key, prior_preview, next_preview FROM app_setting_audit WHERE key = ? ORDER BY id DESC`)
      .all('vndb_token') as Array<{ key: string; prior_preview: string | null; next_preview: string | null }>;
    expect(rows.length).toBe(1);
    expect(rows[0].next_preview).toBe('…BCDE'); // tail4 keeps last 4 chars after the leading ellipsis
    expect(rows[0].next_preview).not.toContain('AAAA');
  });

  it('vndb_backup_url preview is the hostname, not the last 4 chars (audit M5)', () => {
    setAppSetting('vndb_backup_url', 'https://attacker.example.com/path/kana');
    const rows = db
      .prepare(`SELECT next_preview FROM app_setting_audit WHERE key = ? ORDER BY id DESC`)
      .all('vndb_backup_url') as Array<{ next_preview: string | null }>;
    expect(rows[0].next_preview).toBe('attacker.example.com');
    expect(rows[0].next_preview).not.toContain('kana');
  });

  it('vndb_backup_url falls back to tail4 on a malformed URL', () => {
    setAppSetting('vndb_backup_url', 'not a valid url xxxxYYYY');
    const rows = db
      .prepare(`SELECT next_preview FROM app_setting_audit WHERE key = ? ORDER BY id DESC`)
      .all('vndb_backup_url') as Array<{ next_preview: string | null }>;
    expect(rows[0].next_preview).toBe('…YYYY');
  });

  it('non-audited keys do not leave a row in app_setting_audit', () => {
    setAppSetting('default_sort', 'updated_at');
    const rows = db
      .prepare(`SELECT * FROM app_setting_audit WHERE key = ?`)
      .all('default_sort');
    expect(rows.length).toBe(0);
  });

  it('clearing a token records the prior preview', () => {
    setAppSetting('vndb_token', 'AAAAAAAAAAAAAAAABCDE');
    db.exec('DELETE FROM app_setting_audit');
    setAppSetting('vndb_token', null);
    const rows = db
      .prepare(`SELECT prior_preview, next_preview FROM app_setting_audit WHERE key = ? ORDER BY id DESC`)
      .all('vndb_token') as Array<{ prior_preview: string | null; next_preview: string | null }>;
    expect(rows[0].prior_preview).toBe('…BCDE');
    expect(rows[0].next_preview).toBeNull();
  });

  it('round-trip: get returns what set wrote', () => {
    setAppSetting('default_order', 'asc');
    expect(getAppSetting('default_order')).toBe('asc');
  });
});
