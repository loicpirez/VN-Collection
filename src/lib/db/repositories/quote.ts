import type { QueryResultRow } from 'pg';
import type { LocalQuote, QuoteWithVn } from '@/lib/db';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';
import { postgresContainsPattern } from '../postgres-search';

/** Persistence boundary for locally mirrored VNDB quotes. */
export interface QuoteRepository {
  /** List collection quotes with optional text filtering and pagination. */
  list(query?: string, limit?: number, offset?: number): Promise<QuoteWithVn[]>;
  /** Pick one quote from the local collection mirror. */
  randomLocal(): Promise<LocalQuote | null>;
  /** Replace every mirrored quote for one VN atomically. */
  replaceForVn(vnId: string, quotes: readonly MirroredQuote[]): Promise<void>;
}

/** Minimal VNDB quote payload persisted by the local mirror. */
export interface MirroredQuote {
  id: string;
  quote: string;
  score: number;
  character: { id: string; name: string } | null;
}

interface QuoteRow extends QuoteWithVn, QueryResultRow {}
interface LocalQuoteRow extends LocalQuote, QueryResultRow {}

function pageLimit(value: number | undefined): number {
  const integer = Math.floor(value ?? 200);
  return Number.isFinite(integer) ? Math.max(1, Math.min(1000, integer)) : 200;
}

function pageOffset(value: number | undefined): number {
  const integer = Math.floor(value ?? 0);
  return Number.isFinite(integer) ? Math.max(0, integer) : 0;
}

const QUOTE_PROJECTION = `
  quote.quote_id, quote.vn_id, vn.title AS vn_title, quote.quote, quote.score,
  quote.character_id, quote.character_name,
  character_image.local_path AS character_local_image,
  vn.image_url AS vn_image_url,
  vn.local_image AS vn_local_image,
  vn.local_image_thumb AS vn_local_image_thumb
`;

/** Create the PostgreSQL-backed quote repository. */
export function createPostgresQuoteRepository(): QuoteRepository {
  return {
    async list(query, limit, offset) {
      const trimmed = query?.trim() ?? '';
      const values: Array<string | number> = [];
      let where = '';
      if (trimmed) {
        values.push(postgresContainsPattern(trimmed));
        where = `AND (
          app_search_normalize(quote.quote) LIKE $1 ESCAPE '\\'
          OR app_search_normalize(COALESCE(quote.character_name, '')) LIKE $1 ESCAPE '\\'
        )`;
      }
      values.push(pageLimit(limit), pageOffset(offset));
      const limitParameter = `$${values.length - 1}`;
      const offsetParameter = `$${values.length}`;
      const result = await postgresQuery<QuoteRow>(`
        SELECT ${QUOTE_PROJECTION}
        FROM vn_quote quote
        JOIN collection coll ON coll.vn_id = quote.vn_id
        JOIN vn ON vn.id = quote.vn_id
        LEFT JOIN character_image ON character_image.char_id = quote.character_id
        WHERE TRUE ${where}
        ORDER BY quote.score DESC, app_search_normalize(vn.title) COLLATE "C" ASC, quote.quote_id
        LIMIT ${limitParameter} OFFSET ${offsetParameter}
      `, values);
      return result.rows;
    },
    async randomLocal() {
      const result = await postgresQuery<LocalQuoteRow>(`
        SELECT * FROM (
          SELECT ${QUOTE_PROJECTION}
          FROM vn_quote quote
          JOIN collection coll ON coll.vn_id = quote.vn_id
          JOIN vn ON vn.id = quote.vn_id
          LEFT JOIN character_image ON character_image.char_id = quote.character_id
          LIMIT 200
        ) candidates
        ORDER BY RANDOM()
        LIMIT 1
      `);
      return result.rows[0] ?? null;
    },
    async replaceForVn(vnId, quotes) {
      await (await import('../postgres')).withPostgresTransaction(async (client) => {
        await client.query('DELETE FROM vn_quote WHERE vn_id = $1', [vnId]);
        const fetchedAt = Date.now();
        for (const quote of quotes) {
          await client.query(`
            INSERT INTO vn_quote (quote_id, vn_id, quote, score, character_id, character_name, fetched_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [quote.id, vnId, quote.quote, quote.score, quote.character?.id ?? null, quote.character?.name ?? null, fetchedAt]);
        }
      });
    },
  };
}

const sqliteRepository: QuoteRepository = {
  async list(query, limit, offset) {
    return (await import('@/lib/db')).listAllQuotes(query, pageLimit(limit), pageOffset(offset));
  },
  async randomLocal() {
    return (await import('@/lib/db')).getRandomLocalQuote();
  },
  async replaceForVn(vnId, quotes) {
    (await import('@/lib/db')).setQuotesForVn(vnId, [...quotes]);
  },
};

let postgresRepository: QuoteRepository | null = null;

/** Return the quote repository selected by the configured backend. */
export function getQuoteRepository(): QuoteRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresQuoteRepository();
  return postgresRepository;
}
