import {
  getActivityRepository,
  type UserActivity,
  type UserActivityListOptions,
} from './db/repositories/activity';

export type { UserActivity, UserActivityListOptions } from './db/repositories/activity';

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

const ACTIVITY_PAYLOAD_MAX_BYTES = 8 * 1024;

function safePayloadJson(payload: unknown): string | null {
  if (payload == null) return null;
  const masked = maskActivityPayload(payload);
  const raw = JSON.stringify(masked);
  if (raw.length <= ACTIVITY_PAYLOAD_MAX_BYTES) return raw;
  return JSON.stringify({ truncated: true, size: raw.length });
}

/**
 * Insert one row into `user_activity`. Audit failures remain isolated from the
 * surrounding mutation after the persistence attempt. Honours the
 * `VNCOLL_DISABLE_ACTIVITY=1` kill switch and caps every field at the table's
 * column length.
 */
export function recordActivity(input: RecordActivityInput): Promise<void> | void {
  if (process.env.VNCOLL_DISABLE_ACTIVITY === '1') return;
  const kind = input.kind.trim();
  if (!kind) return;
  const payload = safePayloadJson(input.payload);
  const prepared = {
    occurredAt: Date.now(),
    kind: kind.slice(0, 80),
    entity: input.entity?.slice(0, 80) ?? null,
    entityId: input.entityId?.slice(0, 120) ?? null,
    label: input.label?.slice(0, 240) ?? null,
    payload,
    actor: (input.actor ?? 'user').slice(0, 80),
  };
  try {
    return getActivityRepository().record(prepared).catch(() => {
      // Audit persistence must not disrupt the completed user mutation.
    });
  } catch {
    // Audit persistence must not disrupt the completed user mutation.
  }
}

/** Query the backend-selected global activity feed. */
export function listUserActivity(options: UserActivityListOptions = {}): Promise<UserActivity[]> {
  return getActivityRepository().listUser(options);
}

/** Query the backend-selected distinct activity kinds. */
export function listActivityKinds(): Promise<string[]> {
  return getActivityRepository().listKinds();
}
