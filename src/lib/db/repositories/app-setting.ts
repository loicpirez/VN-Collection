import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery, withPostgresTransaction } from '../postgres';

const AUDITED_SETTING_KEYS = new Set(['vndb_token', 'steam_api_key', 'vndb_backup_url']);

interface SettingRow {
  value: string | null;
}

/** Asynchronous persistence contract for application settings. */
export interface AppSettingRepository {
  /** Read one setting or return `null` when absent. */
  get(key: string): Promise<string | null>;
  /** Upsert or delete one setting, including a masked audit row when required. */
  set(key: string, value: string | null): Promise<void>;
  /** Persist a validated group of settings atomically. */
  setMany(entries: readonly AppSettingWrite[]): Promise<void>;
}

/** One application-setting mutation. */
export interface AppSettingWrite {
  key: string;
  value: string | null;
}

function tailPreview(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? `…${trimmed.slice(-4)}` : null;
}

/** Return a non-secret audit preview for one sensitive setting value. */
export function appSettingAuditPreview(key: string, value: string | null): string | null {
  if (!value) return null;
  if (key !== 'vndb_backup_url') return tailPreview(value);
  try {
    const parsed = new URL(value);
    return parsed.hostname || tailPreview(value);
  } catch {
    return tailPreview(value);
  }
}

/** Create the PostgreSQL-backed application-setting repository. */
export function createPostgresAppSettingRepository(): AppSettingRepository {
  const setMany = async (entries: readonly AppSettingWrite[]): Promise<void> => {
    if (entries.length === 0) return;
    await withPostgresTransaction(async (client) => {
      for (const entry of entries) {
        const audited = AUDITED_SETTING_KEYS.has(entry.key);
        const priorResult = audited
          ? await client.query<SettingRow & Record<string, string | null>>(
            'SELECT value FROM app_setting WHERE key = $1 FOR UPDATE',
            [entry.key],
          )
          : null;
        const prior = priorResult?.rows[0]?.value ?? null;
        if (entry.value == null || entry.value.length === 0) {
          await client.query('DELETE FROM app_setting WHERE key = $1', [entry.key]);
        } else {
          await client.query(`
            INSERT INTO app_setting (key, value) VALUES ($1, $2)
            ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
          `, [entry.key, entry.value]);
        }
        if (audited && prior !== entry.value) {
          await client.query(`
            INSERT INTO app_setting_audit (key, prior_preview, next_preview, changed_at)
            VALUES ($1, $2, $3, $4)
          `, [
            entry.key,
            appSettingAuditPreview(entry.key, prior),
            appSettingAuditPreview(entry.key, entry.value),
            Date.now(),
          ]);
        }
      }
    });
  };
  return {
    async get(key) {
      const result = await postgresQuery<SettingRow & Record<string, string | null>>(
        'SELECT value FROM app_setting WHERE key = $1',
        [key],
      );
      return result.rows[0]?.value ?? null;
    },
    async set(key, value) {
      await setMany([{ key, value }]);
    },
    setMany,
  };
}

const sqliteRepository: AppSettingRepository = {
  get: async (key) => {
    const { getAppSetting } = await import('@/lib/db');
    return getAppSetting(key);
  },
  set: async (key, value) => {
    const { setAppSetting } = await import('@/lib/db');
    setAppSetting(key, value);
  },
  setMany: async (entries) => {
    if (entries.length === 0) return;
    const legacy = await import('@/lib/db');
    legacy.db.transaction(() => {
      for (const entry of entries) legacy.setAppSetting(entry.key, entry.value);
    })();
  },
};

let postgresRepository: AppSettingRepository | null = null;

/** Return the configured application-setting repository. */
export function getAppSettingRepository(): AppSettingRepository {
  const config = readDatabaseConfig();
  if (config.backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresAppSettingRepository();
  return postgresRepository;
}
