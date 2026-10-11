import type { QueryResultRow } from 'pg';
import type { AiPlaytimeEstimate } from '@/lib/types';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

export interface AiPlaytimeEstimateInput {
  minutes: number;
  lower_minutes: number;
  upper_minutes: number;
  confidence: number | null;
  model: string;
  rationale: string | null;
  generated_at: number;
}

interface AiPlaytimeRow extends QueryResultRow {
  ai_playtime_minutes: number | null;
  ai_playtime_lower_minutes: number | null;
  ai_playtime_upper_minutes: number | null;
  ai_playtime_confidence: number | null;
  ai_playtime_model: string | null;
  ai_playtime_rationale: string | null;
  ai_playtime_generated_at: number | null;
}

export interface AiPlaytimeRepository {
  get(vnId: string): Promise<AiPlaytimeEstimate | null>;
  set(vnId: string, estimate: AiPlaytimeEstimateInput): Promise<void>;
  clear(vnId: string): Promise<void>;
}

function mapEstimate(row: AiPlaytimeRow | undefined): AiPlaytimeEstimate | null {
  if (
    !row ||
    row.ai_playtime_minutes == null ||
    row.ai_playtime_lower_minutes == null ||
    row.ai_playtime_upper_minutes == null ||
    row.ai_playtime_model == null ||
    row.ai_playtime_generated_at == null
  ) return null;
  return {
    minutes: row.ai_playtime_minutes,
    lower_minutes: row.ai_playtime_lower_minutes,
    upper_minutes: row.ai_playtime_upper_minutes,
    confidence: row.ai_playtime_confidence,
    model: row.ai_playtime_model,
    rationale: row.ai_playtime_rationale,
    generated_at: row.ai_playtime_generated_at,
  };
}

const SELECT_COLUMNS = `
  ai_playtime_minutes, ai_playtime_lower_minutes, ai_playtime_upper_minutes,
  ai_playtime_confidence, ai_playtime_model, ai_playtime_rationale,
  ai_playtime_generated_at
`;

function createPostgresRepository(): AiPlaytimeRepository {
  return {
    async get(vnId) {
      const result = await postgresQuery<AiPlaytimeRow>(
        `SELECT ${SELECT_COLUMNS} FROM collection WHERE vn_id = $1`,
        [vnId],
      );
      return mapEstimate(result.rows[0]);
    },
    async set(vnId, estimate) {
      await postgresQuery(`
        UPDATE collection SET
          ai_playtime_minutes = $1,
          ai_playtime_lower_minutes = $2,
          ai_playtime_upper_minutes = $3,
          ai_playtime_confidence = $4,
          ai_playtime_model = $5,
          ai_playtime_rationale = $6,
          ai_playtime_generated_at = $7,
          updated_at = $8
        WHERE vn_id = $9
      `, [
        estimate.minutes,
        estimate.lower_minutes,
        estimate.upper_minutes,
        estimate.confidence,
        estimate.model,
        estimate.rationale,
        estimate.generated_at,
        Date.now(),
        vnId,
      ]);
    },
    async clear(vnId) {
      await postgresQuery(`
        UPDATE collection SET
          ai_playtime_minutes = NULL,
          ai_playtime_lower_minutes = NULL,
          ai_playtime_upper_minutes = NULL,
          ai_playtime_confidence = NULL,
          ai_playtime_model = NULL,
          ai_playtime_rationale = NULL,
          ai_playtime_generated_at = NULL,
          updated_at = $1
        WHERE vn_id = $2
      `, [Date.now(), vnId]);
    },
  };
}

const sqliteRepository: AiPlaytimeRepository = {
  async get(vnId) {
    const { db } = await import('@/lib/db');
    return mapEstimate(db.prepare(`SELECT ${SELECT_COLUMNS} FROM collection WHERE vn_id = ?`).get(vnId) as AiPlaytimeRow | undefined);
  },
  async set(vnId, estimate) {
    const { db } = await import('@/lib/db');
    db.prepare(`
      UPDATE collection SET
        ai_playtime_minutes = ?,
        ai_playtime_lower_minutes = ?,
        ai_playtime_upper_minutes = ?,
        ai_playtime_confidence = ?,
        ai_playtime_model = ?,
        ai_playtime_rationale = ?,
        ai_playtime_generated_at = ?,
        updated_at = ?
      WHERE vn_id = ?
    `).run(
      estimate.minutes,
      estimate.lower_minutes,
      estimate.upper_minutes,
      estimate.confidence,
      estimate.model,
      estimate.rationale,
      estimate.generated_at,
      Date.now(),
      vnId,
    );
  },
  async clear(vnId) {
    const { db } = await import('@/lib/db');
    db.prepare(`
      UPDATE collection SET
        ai_playtime_minutes = NULL,
        ai_playtime_lower_minutes = NULL,
        ai_playtime_upper_minutes = NULL,
        ai_playtime_confidence = NULL,
        ai_playtime_model = NULL,
        ai_playtime_rationale = NULL,
        ai_playtime_generated_at = NULL,
        updated_at = ?
      WHERE vn_id = ?
    `).run(Date.now(), vnId);
  },
};

let postgresRepository: AiPlaytimeRepository | null = null;

export function getAiPlaytimeRepository(): AiPlaytimeRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresRepository();
  return postgresRepository;
}
