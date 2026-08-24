import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clientQueryMock, postgresQueryMock, withTransactionMock } = vi.hoisted(() => ({
  clientQueryMock: vi.fn(),
  postgresQueryMock: vi.fn(),
  withTransactionMock: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: postgresQueryMock,
  withPostgresTransaction: withTransactionMock,
}));

import {
  appSettingAuditPreview,
  createPostgresAppSettingRepository,
} from '@/lib/db/repositories/app-setting';

describe('PostgreSQL application settings', () => {
  beforeEach(() => {
    clientQueryMock.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    postgresQueryMock.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    withTransactionMock.mockReset().mockImplementation(async (callback) => callback({ query: clientQueryMock }));
  });

  it('builds non-secret audit previews for tokens and backup URLs', () => {
    expect(appSettingAuditPreview('vndb_token', null)).toBeNull();
    expect(appSettingAuditPreview('vndb_token', '   ')).toBeNull();
    expect(appSettingAuditPreview('vndb_token', 'secret-token')).toBe('…oken');
    expect(appSettingAuditPreview('vndb_backup_url', 'https://backup.example.test/private?token=secret')).toBe('backup.example.test');
    expect(appSettingAuditPreview('vndb_backup_url', 'not a url')).toBe('… url');
    expect(appSettingAuditPreview('vndb_backup_url', 'mailto:user@example.test')).toBe('…test');
  });

  it('returns stored settings and null for absent rows', async () => {
    postgresQueryMock
      .mockResolvedValueOnce({ rows: [{ value: 'stored' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ value: null }], rowCount: 1 });
    const repository = createPostgresAppSettingRepository();

    await expect(repository.get('present')).resolves.toBe('stored');
    await expect(repository.get('absent')).resolves.toBeNull();
    await expect(repository.get('null-value')).resolves.toBeNull();
  });

  it('upserts and deletes ordinary settings without an audit query', async () => {
    const repository = createPostgresAppSettingRepository();
    await repository.setMany([]);
    expect(withTransactionMock).not.toHaveBeenCalled();

    await repository.set('theme', 'dark');
    expect(clientQueryMock).toHaveBeenCalledOnce();
    expect(clientQueryMock.mock.calls[0]?.[0]).toContain('INSERT INTO app_setting');

    clientQueryMock.mockClear();
    await repository.set('theme', null);
    await repository.set('theme', '');
    expect(clientQueryMock).toHaveBeenCalledTimes(2);
    expect(clientQueryMock.mock.calls[0]?.[0]).toContain('DELETE FROM app_setting');
    expect(clientQueryMock.mock.calls[1]?.[0]).toContain('DELETE FROM app_setting');
  });

  it('audits changed sensitive values but not identical values', async () => {
    const repository = createPostgresAppSettingRepository();
    clientQueryMock.mockResolvedValueOnce({ rows: [{ value: 'old-secret' }], rowCount: 1 });
    await repository.set('vndb_token', 'new-secret');
    expect(clientQueryMock).toHaveBeenCalledTimes(3);
    expect(clientQueryMock.mock.calls[0]?.[0]).toContain('FOR UPDATE');
    expect(clientQueryMock.mock.calls[2]?.[0]).toContain('app_setting_audit');
    expect(clientQueryMock.mock.calls[2]?.[1]?.slice(0, 3)).toEqual(['vndb_token', '…cret', '…cret']);

    clientQueryMock.mockReset().mockResolvedValueOnce({ rows: [{ value: 'same-secret' }], rowCount: 1 });
    await repository.set('steam_api_key', 'same-secret');
    expect(clientQueryMock).toHaveBeenCalledTimes(2);
    expect(clientQueryMock.mock.calls.some(([sql]) => String(sql).includes('app_setting_audit'))).toBe(false);

    clientQueryMock.mockReset().mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await repository.set('vndb_backup_url', null);
    expect(clientQueryMock).toHaveBeenCalledTimes(2);
  });
});
