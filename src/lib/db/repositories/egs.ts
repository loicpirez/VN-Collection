import type { QueryResultRow } from 'pg';
import type { EgsRow, EgsVnLink, VnEgsLink } from '@/lib/db';
import { isVndbVnId } from '@/lib/vn-id-shape';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

/** EGS row accepted by persistence before its fetch timestamp is stamped. */
export type EgsUpsert = Omit<EgsRow, 'fetched_at' | 'local_image'> & {
  local_image?: string | null;
};

/** Minimal persisted EGS payload required by cover resolution. */
export interface EgsCoverSourceRow {
  vn_id: string | null;
  raw_json: string | null;
}

interface EgsStorageRow extends QueryResultRow, EgsRow {}
interface VnEgsLinkRow extends QueryResultRow, VnEgsLink {}
interface EgsVnLinkRow extends QueryResultRow, EgsVnLink {}
interface EgsVnMapRow extends QueryResultRow {
  egs_id: number;
  vn_id: string | null;
}

/** Persistence boundary for EGS metadata and reversible manual mappings. */
export interface EgsRepository {
  /** Read one cached EGS resolution by VN id. */
  getForVn(vnId: string): Promise<EgsRow | null>;
  /** Read raw cover-source metadata by EGS game id. */
  getCoverSource(egsId: number): Promise<EgsCoverSourceRow | null>;
  /** Insert or refresh one EGS resolution while preserving a downloaded image. */
  upsertForVn(row: EgsUpsert): Promise<void>;
  /** Set or clear the locally downloaded EGS image path. */
  setLocalImage(vnId: string, localPath: string | null): Promise<void>;
  /** Clear one cached EGS resolution without changing manual decisions. */
  clearForVn(vnId: string): Promise<void>;
  /** Read one manual VN-to-EGS decision. */
  getVnLink(vnId: string): Promise<VnEgsLink | null>;
  /** Set one manual VN-to-EGS decision, including explicit no-match. */
  setVnLink(vnId: string, egsId: number | null, note?: string | null): Promise<void>;
  /** Clear one manual VN-to-EGS decision. */
  clearVnLink(vnId: string): Promise<void>;
  /** Read one manual EGS-to-VN decision. */
  getEgsLink(egsId: number): Promise<EgsVnLink | null>;
  /** Set one manual EGS-to-VN decision, including explicit no-match. */
  setEgsLink(egsId: number, vnId: string | null, note?: string | null): Promise<void>;
  /** Clear one manual EGS-to-VN decision. */
  clearEgsLink(egsId: number): Promise<void>;
  /** Return all EGS-to-VN decisions for feed overlays. */
  listAllEgsLinks(): Promise<Map<number, string | null>>;
}

const EGS_COLUMNS = `
  vn_id, egs_id, gamename, gamename_furigana, brand_id, brand_name, model,
  description, image_url, local_image, okazu, erogame, raw_json, median,
  average, dispersion, count, sellday, playtime_median_minutes, source, fetched_at
`;

function validateEgsId(egsId: number): void {
  if (!Number.isSafeInteger(egsId) || egsId <= 0) throw new Error('invalid egs id');
}

function normalizeVnId(vnId: string): string {
  if (!isVndbVnId(vnId)) throw new Error('invalid vn id');
  return vnId.toLowerCase();
}

/** Create the PostgreSQL-backed EGS repository. */
export function createPostgresEgsRepository(): EgsRepository {
  return {
    async getForVn(vnId) {
      const result = await postgresQuery<EgsStorageRow>(`
        SELECT ${EGS_COLUMNS} FROM egs_game WHERE vn_id = $1
      `, [vnId]);
      return result.rows[0] ?? null;
    },
    async getCoverSource(egsId) {
      const result = await postgresQuery<EgsCoverSourceRow & QueryResultRow>(`
        SELECT vn_id, raw_json FROM egs_game WHERE egs_id = $1 LIMIT 1
      `, [egsId]);
      return result.rows[0] ?? null;
    },
    async upsertForVn(row) {
      await postgresQuery(`
        INSERT INTO egs_game (
          ${EGS_COLUMNS}
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21
        )
        ON CONFLICT (vn_id) DO UPDATE SET
          egs_id = EXCLUDED.egs_id,
          gamename = EXCLUDED.gamename,
          gamename_furigana = EXCLUDED.gamename_furigana,
          brand_id = EXCLUDED.brand_id,
          brand_name = EXCLUDED.brand_name,
          model = EXCLUDED.model,
          description = EXCLUDED.description,
          image_url = EXCLUDED.image_url,
          local_image = COALESCE(EXCLUDED.local_image, egs_game.local_image),
          okazu = EXCLUDED.okazu,
          erogame = EXCLUDED.erogame,
          raw_json = EXCLUDED.raw_json,
          median = EXCLUDED.median,
          average = EXCLUDED.average,
          dispersion = EXCLUDED.dispersion,
          count = EXCLUDED.count,
          sellday = EXCLUDED.sellday,
          playtime_median_minutes = EXCLUDED.playtime_median_minutes,
          source = EXCLUDED.source,
          fetched_at = EXCLUDED.fetched_at
      `, [
        row.vn_id,
        row.egs_id,
        row.gamename,
        row.gamename_furigana ?? null,
        row.brand_id ?? null,
        row.brand_name ?? null,
        row.model ?? null,
        row.description ?? null,
        row.image_url ?? null,
        row.local_image ?? null,
        row.okazu ?? null,
        row.erogame ?? null,
        row.raw_json ?? null,
        row.median,
        row.average,
        row.dispersion,
        row.count,
        row.sellday,
        row.playtime_median_minutes,
        row.source,
        Date.now(),
      ]);
    },
    async setLocalImage(vnId, localPath) {
      await postgresQuery('UPDATE egs_game SET local_image = $1 WHERE vn_id = $2', [localPath, vnId]);
    },
    async clearForVn(vnId) {
      await postgresQuery('DELETE FROM egs_game WHERE vn_id = $1', [vnId]);
    },
    async getVnLink(vnId) {
      const result = await postgresQuery<VnEgsLinkRow>(`
        SELECT vn_id, egs_id, note, updated_at FROM vn_egs_link WHERE vn_id = $1
      `, [vnId.toLowerCase()]);
      return result.rows[0] ?? null;
    },
    async setVnLink(vnId, egsId, note) {
      const normalized = normalizeVnId(vnId);
      if (egsId !== null) validateEgsId(egsId);
      await postgresQuery(`
        INSERT INTO vn_egs_link (vn_id, egs_id, note, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (vn_id) DO UPDATE SET
          egs_id = EXCLUDED.egs_id,
          note = EXCLUDED.note,
          updated_at = EXCLUDED.updated_at
      `, [normalized, egsId, note ?? null, Date.now()]);
    },
    async clearVnLink(vnId) {
      await postgresQuery('DELETE FROM vn_egs_link WHERE vn_id = $1', [vnId.toLowerCase()]);
    },
    async getEgsLink(egsId) {
      const result = await postgresQuery<EgsVnLinkRow>(`
        SELECT egs_id, vn_id, note, updated_at FROM egs_vn_link WHERE egs_id = $1
      `, [egsId]);
      return result.rows[0] ?? null;
    },
    async setEgsLink(egsId, vnId, note) {
      validateEgsId(egsId);
      const normalized = vnId === null ? null : normalizeVnId(vnId);
      await postgresQuery(`
        INSERT INTO egs_vn_link (egs_id, vn_id, note, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (egs_id) DO UPDATE SET
          vn_id = EXCLUDED.vn_id,
          note = EXCLUDED.note,
          updated_at = EXCLUDED.updated_at
      `, [egsId, normalized, note ?? null, Date.now()]);
    },
    async clearEgsLink(egsId) {
      await postgresQuery('DELETE FROM egs_vn_link WHERE egs_id = $1', [egsId]);
    },
    async listAllEgsLinks() {
      const result = await postgresQuery<EgsVnMapRow>(`
        SELECT egs_id, vn_id FROM egs_vn_link ORDER BY egs_id LIMIT 50000
      `);
      return new Map(result.rows.map((row) => [row.egs_id, row.vn_id]));
    },
  };
}

const sqliteRepository: EgsRepository = {
  async getForVn(vnId) {
    return (await import('@/lib/db')).getEgsForVn(vnId);
  },
  async getCoverSource(egsId) {
    const row = (await import('@/lib/db')).db
      .prepare('SELECT vn_id, raw_json FROM egs_game WHERE egs_id = ? LIMIT 1')
      .get(egsId) as EgsCoverSourceRow | undefined;
    return row ?? null;
  },
  async upsertForVn(row) {
    (await import('@/lib/db')).upsertEgsForVn(row);
  },
  async setLocalImage(vnId, localPath) {
    (await import('@/lib/db')).setEgsLocalImage(vnId, localPath);
  },
  async clearForVn(vnId) {
    (await import('@/lib/db')).clearEgsForVn(vnId);
  },
  async getVnLink(vnId) {
    return (await import('@/lib/db')).getVnEgsLink(vnId);
  },
  async setVnLink(vnId, egsId, note) {
    (await import('@/lib/db')).setVnEgsLink(vnId, egsId, note);
  },
  async clearVnLink(vnId) {
    (await import('@/lib/db')).clearVnEgsLink(vnId);
  },
  async getEgsLink(egsId) {
    return (await import('@/lib/db')).getEgsVnLink(egsId);
  },
  async setEgsLink(egsId, vnId, note) {
    (await import('@/lib/db')).setEgsVnLink(egsId, vnId, note);
  },
  async clearEgsLink(egsId) {
    (await import('@/lib/db')).clearEgsVnLink(egsId);
  },
  async listAllEgsLinks() {
    return (await import('@/lib/db')).listAllEgsVnLinks();
  },
};

let postgresRepository: EgsRepository | null = null;

/** Return the EGS repository selected by the configured backend. */
export function getEgsRepository(): EgsRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresEgsRepository();
  return postgresRepository;
}
