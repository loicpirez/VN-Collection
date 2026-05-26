import { db } from './db';

export interface UserActivity {
  id: number;
  occurred_at: number;
  kind: string;
  entity: string | null;
  entity_id: string | null;
  label: string | null;
  payload: string | null;
  actor: string;
}

export interface RecordActivityInput {
  kind: string;
  entity?: string | null;
  entityId?: string | null;
  label?: string | null;
  payload?: Record<string, unknown> | null;
  actor?: string;
}

/**
 * Mask values whose KEY name is sensitive.
 *
 * Anchored on word boundaries (start-of-string OR underscore prefix +
 * end-of-string) so we mask:
 *   - bare credential words: `token`, `secret`, `password`, `cookie`,
 *     `authorization`, `bearer`, `credential`
 *   - suffix-matched: `vndb_token`, `steam_api_key`, `api_token`,
 *     `access_token`, `refresh_token`, `backup_url`
 * and DO NOT mask innocuous keys that contain a sensitive token as a
 * substring: `aspect_key`, `cache_key`, `entity_key`. The previous
 * pattern `/key/i` was too greedy and produced a regression where the
 * `aspect_key` payload field was masked in the activity log, hiding
 * useful audit information.
 */
const SENSITIVE_KEY_RE =
  /(?:^|_)(?:token|secret|password|credential|cookie|authorization|bearer|backup_url|api_key|api_token|access_token|refresh_token)$/i;

/**
 * Recursively walk a JSON-shaped value, masking entries whose key matches
 * `SENSITIVE_KEY_RE`. Used before writing payloads to the audit log so
 * credentials never reach disk in plaintext.
 */
export function maskActivityPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskActivityPayload);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      out[key] = '[masked]';
    } else {
      out[key] = maskActivityPayload(raw);
    }
  }
  return out;
}

// R5-127: hard cap on serialised activity payloads. The `payload`
// JSON is stored as TEXT in `user_activity` and was previously
// bound only by the table-row size. A pathological import / EGS
// scrape could write a multi-megabyte blob per row. Cap at 8 KB
// and replace overflow with a `{ truncated: true, size: N }`
// stub so the row stays useful for "what kind of event happened"
// without ballooning the table.
const ACTIVITY_PAYLOAD_MAX_BYTES = 8 * 1024;

function safePayloadJson(payload: unknown): string | null {
  if (payload == null) return null;
  const masked = maskActivityPayload(payload);
  const raw = JSON.stringify(masked);
  if (raw.length <= ACTIVITY_PAYLOAD_MAX_BYTES) return raw;
  return JSON.stringify({ truncated: true, size: raw.length });
}

/**
 * Insert one row into `user_activity`. Fire-and-forget: swallows DB errors so
 * audit failures never bubble into surrounding write transactions. Honours the
 * `VNCOLL_DISABLE_ACTIVITY=1` kill switch and caps every field at the table's
 * column length.
 */
export function recordActivity(input: RecordActivityInput): void {
  if (process.env.VNCOLL_DISABLE_ACTIVITY === '1') return;
  const kind = input.kind.trim();
  if (!kind) return;
  const payload = safePayloadJson(input.payload);
  try {
    db.prepare(
      `INSERT INTO user_activity (occurred_at, kind, entity, entity_id, label, payload, actor)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      Date.now(),
      kind.slice(0, 80),
      input.entity?.slice(0, 80) ?? null,
      input.entityId?.slice(0, 120) ?? null,
      input.label?.slice(0, 240) ?? null,
      payload,
      (input.actor ?? 'user').slice(0, 80),
    );
  } catch {
    // Activity recording is fire-and-forget; a DB error must not
    // surface to the caller or disrupt the surrounding transaction.
  }
}

/**
 * Query the global activity feed with optional filters. `q` runs a LIKE
 * across label / entity_id / payload (so JSON substrings are searchable).
 * `limit` is clamped to `[1, 500]` server-side to bound result size.
 */
export function listUserActivity({
  limit = 100,
  kind,
  entity,
  q,
  from,
  to,
}: {
  limit?: number;
  kind?: string | null;
  entity?: string | null;
  q?: string | null;
  from?: number | null;
  to?: number | null;
} = {}): UserActivity[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (kind) {
    where.push('kind = ?');
    args.push(kind);
  }
  if (entity) {
    where.push('entity = ?');
    args.push(entity);
  }
  if (q) {
    where.push('(label LIKE ? OR entity_id LIKE ? OR payload LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like);
  }
  if (from != null) {
    where.push('occurred_at >= ?');
    args.push(from);
  }
  if (to != null) {
    where.push('occurred_at <= ?');
    args.push(to);
  }
  const sql = `SELECT * FROM user_activity ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY occurred_at DESC, id DESC LIMIT ?`;
  args.push(Math.max(1, Math.min(500, Math.floor(limit))));
  return db.prepare(sql).all(...args) as UserActivity[];
}

/**
 * Distinct `kind` values present in `user_activity`, used to populate the
 * filter dropdown on the global activity feed.
 */
export function listActivityKinds(): string[] {
  const rows = db
    .prepare('SELECT DISTINCT kind FROM user_activity ORDER BY kind COLLATE NOCASE')
    .all() as Array<{ kind: string }>;
  return rows.map((r) => r.kind);
}

