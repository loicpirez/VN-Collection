import type { QueryResultRow } from 'pg';
import { isValidStatus, type Status } from '@/lib/types';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

/** Local collection row considered by the VNDB library importer. */
export interface LocalVndbImportVn {
  vn_id: string;
  title: string;
  status: Status;
}

/** Local owned-edition row considered by the VNDB release-list importer. */
export interface LocalVndbImportRelease {
  vn_id: string;
  release_id: string;
  vn_title: string;
  edition_label: string | null;
}

/** Stable local snapshot used to preview and revalidate a VNDB import. */
export interface LocalVndbImportSnapshot {
  vns: LocalVndbImportVn[];
  releases: LocalVndbImportRelease[];
}

/** Persistence contract for the local rows that can be imported into VNDB lists. */
export interface VndbLocalImportRepository {
  /** Read collection membership and owned editions in one coherent snapshot. */
  listSnapshot(): Promise<LocalVndbImportSnapshot>;
}

interface ImportVnDatabaseRow extends QueryResultRow {
  vn_id: string;
  title: string;
  status: string;
}

interface ImportReleaseDatabaseRow extends QueryResultRow {
  vn_id: string;
  release_id: string;
  vn_title: string;
  edition_label: string | null;
}

function mapVns(rows: readonly ImportVnDatabaseRow[]): LocalVndbImportVn[] {
  return rows.flatMap((row) => isValidStatus(row.status)
    ? [{ vn_id: row.vn_id.toLowerCase(), title: row.title, status: row.status }]
    : []);
}

function mapReleases(rows: readonly ImportReleaseDatabaseRow[]): LocalVndbImportRelease[] {
  return rows.map((row) => ({
    vn_id: row.vn_id.toLowerCase(),
    release_id: row.release_id.toLowerCase(),
    vn_title: row.vn_title,
    edition_label: row.edition_label,
  }));
}

const postgresRepository: VndbLocalImportRepository = {
  async listSnapshot() {
    const [vns, releases] = await Promise.all([
      postgresQuery<ImportVnDatabaseRow>(`
        SELECT c.vn_id, v.title, c.status
        FROM collection c
        JOIN vn v ON v.id = c.vn_id
        ORDER BY v.title COLLATE "C", c.vn_id
      `),
      postgresQuery<ImportReleaseDatabaseRow>(`
        SELECT o.vn_id, o.release_id, v.title AS vn_title, o.edition_label
        FROM owned_release o
        JOIN vn v ON v.id = o.vn_id
        ORDER BY v.title COLLATE "C", o.release_id
      `),
    ]);
    return { vns: mapVns(vns.rows), releases: mapReleases(releases.rows) };
  },
};

const sqliteRepository: VndbLocalImportRepository = {
  async listSnapshot() {
    const { db } = await import('@/lib/db');
    const vns = db.prepare(`
      SELECT c.vn_id, v.title, c.status
      FROM collection c
      JOIN vn v ON v.id = c.vn_id
      ORDER BY v.title COLLATE NOCASE, c.vn_id
    `).all() as ImportVnDatabaseRow[];
    const releases = db.prepare(`
      SELECT o.vn_id, o.release_id, v.title AS vn_title, o.edition_label
      FROM owned_release o
      JOIN vn v ON v.id = o.vn_id
      ORDER BY v.title COLLATE NOCASE, o.release_id
    `).all() as ImportReleaseDatabaseRow[];
    return { vns: mapVns(vns), releases: mapReleases(releases) };
  },
};

/** Return the VNDB local-import reader configured for the active database engine. */
export function getVndbLocalImportRepository(): VndbLocalImportRepository {
  return readDatabaseConfig().backend === 'postgres' ? postgresRepository : sqliteRepository;
}
