import type { QueryResultRow } from 'pg';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery, withPostgresTransaction } from '../postgres';

/** One user-defined VN list. */
export interface UserList {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  pinned: number;
  created_at: number;
  updated_at: number;
}

/** User list enriched with its member count. */
export interface UserListWithCount extends UserList {
  vn_count: number;
}

/** One ordered membership row. */
export interface UserListItem {
  list_id: number;
  vn_id: string;
  order_index: number;
  added_at: number;
  note: string | null;
}

/** Mutable user-list metadata fields. */
export interface UserListPatch {
  name?: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  pinned?: boolean;
}

/** Asynchronous persistence contract for personal lists and memberships. */
export interface UserListRepository {
  /** List every personal list with its member count. */
  list(): Promise<UserListWithCount[]>;
  /** Return one personal list by id. */
  get(id: number): Promise<UserList | null>;
  /** Return one list's ordered memberships. */
  items(id: number): Promise<UserListItem[]>;
  /** Return every list containing one VN. */
  listForVn(vnId: string): Promise<UserList[]>;
  /** Patch one list, including a collision-free slug after rename. */
  update(id: number, patch: UserListPatch): Promise<UserList | null>;
  /** Delete one list and report whether it existed. */
  remove(id: number): Promise<boolean>;
  /** Add or update one membership. */
  addItem(id: number, vnId: string, note?: string | null): Promise<UserListItem | null>;
  /** Remove one membership and report whether it existed. */
  removeItem(id: number, vnId: string): Promise<boolean>;
  /** Persist one list's item order atomically. */
  reorder(id: number, vnIds: readonly string[]): Promise<void>;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'list';
}

async function uniqueSlug(
  query: (text: string, values: readonly (string | number)[]) => Promise<{ rows: QueryResultRow[] }>,
  base: string,
  excludedId: number,
): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (true) {
    const result = await query(
      'SELECT 1 FROM user_list WHERE slug = $1 AND id <> $2',
      [candidate, excludedId],
    );
    if (!result.rows[0]) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

function asList(row: UserList | undefined): UserList | null {
  return row ?? null;
}

/** Create the PostgreSQL-backed personal-list repository. */
export function createPostgresUserListRepository(): UserListRepository {
  return {
    async list() {
      const result = await postgresQuery<UserListWithCount & QueryResultRow>(`
        SELECT user_list.id, user_list.name, user_list.slug, user_list.description,
          user_list.color, user_list.icon, user_list.pinned, user_list.created_at,
          user_list.updated_at, COUNT(user_list_vn.list_id)::BIGINT AS vn_count
        FROM user_list LEFT JOIN user_list_vn ON user_list_vn.list_id = user_list.id
        GROUP BY user_list.id
        ORDER BY user_list.pinned DESC, user_list.updated_at DESC, user_list.id DESC
      `);
      return result.rows;
    },
    async get(id) {
      const result = await postgresQuery<UserList & QueryResultRow>(`
        SELECT id, name, slug, description, color, icon, pinned, created_at, updated_at
        FROM user_list WHERE id = $1
      `, [id]);
      return asList(result.rows[0]);
    },
    async items(id) {
      const result = await postgresQuery<UserListItem & QueryResultRow>(`
        SELECT list_id, vn_id, order_index, added_at, note FROM user_list_vn
        WHERE list_id = $1 ORDER BY order_index, added_at DESC, vn_id
      `, [id]);
      return result.rows;
    },
    async listForVn(vnId) {
      const result = await postgresQuery<UserList & QueryResultRow>(`
        SELECT user_list.id, user_list.name, user_list.slug, user_list.description,
          user_list.color, user_list.icon, user_list.pinned, user_list.created_at,
          user_list.updated_at
        FROM user_list JOIN user_list_vn ON user_list_vn.list_id = user_list.id
        WHERE user_list_vn.vn_id = $1
        ORDER BY user_list.pinned DESC, app_search_normalize(user_list.name) COLLATE "C", user_list.id
      `, [vnId]);
      return result.rows;
    },
    async update(id, patch) {
      return withPostgresTransaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('user_list:slug', 0))");
        const currentResult = await client.query<UserList & QueryResultRow>(`
          SELECT id, name, slug, description, color, icon, pinned, created_at, updated_at
          FROM user_list WHERE id = $1 FOR UPDATE
        `, [id]);
        const current = currentResult.rows[0];
        if (!current) return null;
        const name = patch.name === undefined ? current.name : patch.name.trim().slice(0, 120);
        if (!name) throw new Error('name required');
        const slug = name === current.name
          ? current.slug
          : await uniqueSlug((text, values) => client.query(text, [...values]), slugify(name), id);
        const next: UserList = {
          ...current,
          name,
          slug,
          description: patch.description === undefined ? current.description : patch.description,
          color: patch.color === undefined ? current.color : patch.color,
          icon: patch.icon === undefined ? current.icon : patch.icon,
          pinned: patch.pinned === undefined ? current.pinned : patch.pinned ? 1 : 0,
          updated_at: Date.now(),
        };
        const result = await client.query<UserList & QueryResultRow>(`
          UPDATE user_list SET name = $1, slug = $2, description = $3, color = $4,
            icon = $5, pinned = $6, updated_at = $7 WHERE id = $8
          RETURNING id, name, slug, description, color, icon, pinned, created_at, updated_at
        `, [next.name, next.slug, next.description, next.color, next.icon, next.pinned, next.updated_at, id]);
        return asList(result.rows[0]);
      });
    },
    async remove(id) {
      const result = await postgresQuery('DELETE FROM user_list WHERE id = $1', [id]);
      return (result.rowCount ?? 0) > 0;
    },
    async addItem(id, vnId, note = null) {
      return withPostgresTransaction(async (client) => {
        const listResult = await client.query('SELECT id FROM user_list WHERE id = $1 FOR UPDATE', [id]);
        if (!listResult.rows[0]) return null;
        const normalized = vnId.toLowerCase();
        const existing = await client.query<UserListItem & QueryResultRow>(`
          SELECT list_id, vn_id, order_index, added_at, note FROM user_list_vn
          WHERE list_id = $1 AND vn_id = $2
        `, [id, normalized]);
        const now = Date.now();
        let item: UserListItem;
        if (existing.rows[0]) {
          const result = await client.query<UserListItem & QueryResultRow>(`
            UPDATE user_list_vn SET note = $1 WHERE list_id = $2 AND vn_id = $3
            RETURNING list_id, vn_id, order_index, added_at, note
          `, [note, id, normalized]);
          item = result.rows[0]!;
        } else {
          const result = await client.query<UserListItem & QueryResultRow>(`
            INSERT INTO user_list_vn (list_id, vn_id, order_index, added_at, note)
            VALUES ($1, $2, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM user_list_vn WHERE list_id = $1), $3, $4)
            RETURNING list_id, vn_id, order_index, added_at, note
          `, [id, normalized, now, note]);
          item = result.rows[0]!;
        }
        await client.query('UPDATE user_list SET updated_at = $1 WHERE id = $2', [now, id]);
        return item;
      });
    },
    async removeItem(id, vnId) {
      return withPostgresTransaction(async (client) => {
        const result = await client.query(
          'DELETE FROM user_list_vn WHERE list_id = $1 AND vn_id = $2',
          [id, vnId.toLowerCase()],
        );
        const removed = (result.rowCount ?? 0) > 0;
        if (removed) await client.query('UPDATE user_list SET updated_at = $1 WHERE id = $2', [Date.now(), id]);
        return removed;
      });
    },
    async reorder(id, vnIds) {
      await withPostgresTransaction(async (client) => {
        await client.query('SELECT id FROM user_list WHERE id = $1 FOR UPDATE', [id]);
        for (const [index, vnId] of vnIds.entries()) {
          await client.query(
            'UPDATE user_list_vn SET order_index = $1 WHERE list_id = $2 AND vn_id = $3',
            [index, id, vnId.toLowerCase()],
          );
        }
        await client.query('UPDATE user_list SET updated_at = $1 WHERE id = $2', [Date.now(), id]);
      });
    },
  };
}

const sqliteRepository: UserListRepository = {
  async list() {
    return (await import('@/lib/db')).listUserLists();
  },
  async get(id) {
    return (await import('@/lib/db')).getUserList(id);
  },
  async items(id) {
    return (await import('@/lib/db')).listUserListItems(id);
  },
  async listForVn(vnId) {
    return (await import('@/lib/db')).listListsForVn(vnId);
  },
  async update(id, patch) {
    return (await import('@/lib/db')).updateUserList(id, patch);
  },
  async remove(id) {
    return (await import('@/lib/db')).deleteUserList(id);
  },
  async addItem(id, vnId, note) {
    const legacy = await import('@/lib/db');
    return legacy.addVnToList(id, vnId.toLowerCase(), note);
  },
  async removeItem(id, vnId) {
    return (await import('@/lib/db')).removeVnFromList(id, vnId.toLowerCase());
  },
  async reorder(id, vnIds) {
    (await import('@/lib/db')).reorderListItems(id, vnIds.map((vnId) => vnId.toLowerCase()));
  },
};

let postgresRepository: UserListRepository | null = null;

/** Return the personal-list repository selected by the configured backend. */
export function getUserListRepository(): UserListRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresUserListRepository();
  return postgresRepository;
}
