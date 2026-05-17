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

const SENSITIVE_KEY_RE = /token|secret|password|key|credential|auth|cookie|backup_url|api/i;

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

export function recordActivity(input: RecordActivityInput): void {
  if (process.env.VNCOLL_DISABLE_ACTIVITY === '1') return;
  const kind = input.kind.trim();
  if (!kind) return;
  const payload = input.payload == null ? null : JSON.stringify(maskActivityPayload(input.payload));
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
}

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

export function listActivityKinds(): string[] {
  const rows = db
    .prepare('SELECT DISTINCT kind FROM user_activity ORDER BY kind COLLATE NOCASE')
    .all() as Array<{ kind: string }>;
  return rows.map((r) => r.kind);
}

