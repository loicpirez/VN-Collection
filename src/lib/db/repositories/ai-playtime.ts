import type { QueryResultRow } from 'pg';
import type { AiPlaytimeEstimate } from '@/lib/types';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

/** Validated estimate and provenance persisted independently of the personal play log. */
export interface AiPlaytimeEstimateInput {
  /** Central estimated duration in positive integer minutes. */
  minutes: number;
  /** Positive lower bound, no greater than the central duration. */
  lower_minutes: number;
  /** Positive upper bound, no smaller than the central duration. */
  upper_minutes: number;
  /** Optional confidence in the inclusive zero-to-one range. */
  confidence: number | null;
  /** Nonempty identifier of the estimator that produced the duration. */
  model: string;
  /** Optional explanation of the estimate's evidence and uncertainty. */
  rationale: string | null;
  /** Generation timestamp in Unix epoch milliseconds. */
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

/** Backend-independent persistence contract for a collected VN's AI duration. */
export interface AiPlaytimeRepository {
  /**
   * Reads a complete estimate, excluding absent or incomplete stored values.
   * @param vnId - Canonical VN identifier.
   * @returns Estimate and provenance, or null when unavailable.
   */
  get(vnId: string): Promise<AiPlaytimeEstimate | null>;
  /**
   * Replaces the AI estimate without modifying personally logged minutes.
   * @param vnId - Canonical identifier of an existing collected VN.
   * @param estimate - Validated complete estimate.
   * @returns Resolution after persistence succeeds.
   */
  set(vnId: string, estimate: AiPlaytimeEstimateInput): Promise<void>;
  /**
   * Clears every AI provenance field while retaining other collection data.
   * @param vnId - Canonical identifier of an existing collected VN.
   * @returns Resolution after persistence succeeds.
   */
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
    const { db, invalidateAggregateStats } = await import('@/lib/db');
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
    invalidateAggregateStats();
  },
  async clear(vnId) {
    const { db, invalidateAggregateStats } = await import('@/lib/db');
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
    invalidateAggregateStats();
  },
};

let postgresRepository: AiPlaytimeRepository | null = null;

/**
 * Resolves the configured database adapter, reusing the PostgreSQL instance.
 * @returns Repository for the active database backend.
 */
export function getAiPlaytimeRepository(): AiPlaytimeRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresRepository();
  return postgresRepository;
}
