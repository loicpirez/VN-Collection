/** SQLite tables migrated to PostgreSQL in foreign-key-safe creation order. */
export const POSTGRES_TABLE_ORDER = [
  'vn',
  'collection',
  'producer',
  'series',
  'series_vn',
  'vndb_cache',
  'owned_release',
  'physical_bundle',
  'physical_bundle_member',
  'vn_route',
  'character_image',
  'egs_game',
  'app_setting',
  'vn_quote',
  'vn_staff_credit',
  'vn_va_credit',
  'vn_activity',
  'saved_filter',
  'reading_queue',
  'reading_goal',
  'steam_link',
  'vn_game_log',
  'user_list',
  'user_list_vn',
  'shelf_unit',
  'shelf_slot',
  'app_setting_audit',
  'staff_credit_index',
  'character_vn_index',
  'release_resolution_cache',
  'owned_release_aspect_override',
  'shelf_display_slot',
  'vn_aspect_override',
  'vn_egs_link',
  'egs_vn_link',
  'release_meta_cache',
  'user_activity',
  'vn_tag_index',
  'vn_developer_index',
  'vn_publisher_index',
  'collection_place_index',
  'vn_language_index',
  'vn_platform_index',
  'alicenet_stock',
  'vn_stock_offer',
  'vn_stock_provider_status',
  'vn_stock_alias',
  'vn_stock_source',
  'vn_title_resolve_cache',
  'place_registry',
  'place_provider_link',
  'stock_batch_job',
  'stock_provider_batch_run',
  'app_job_lock',
] as const;

/** One table name accepted by the controlled migration utility. */
export type PostgresMigrationTable = (typeof POSTGRES_TABLE_ORDER)[number];

/** Persisted text columns whose non-empty values must contain valid JSON. */
export const POSTGRES_JSON_COLUMNS: Readonly<Partial<Record<PostgresMigrationTable, readonly string[]>>> = {
  vn: ['aliases', 'developers', 'editions', 'extlinks', 'languages', 'platforms', 'publishers', 'relations', 'release_images', 'screenshots', 'staff', 'tags', 'titles', 'va'],
  collection: ['source_pref'],
  producer: ['aliases', 'extlinks'],
  egs_game: ['raw_json'],
  release_meta_cache: ['extlinks', 'languages', 'platforms'],
  alicenet_stock: ['vn_candidates'],
  vn_stock_offer: ['match_warnings_json'],
  vn_stock_provider_status: ['extras_json'],
  stock_batch_job: ['current_item_params_json', 'errors_json', 'label_params_json', 'providers_json'],
};

/** Storage and malformed-value policy shared by every contractual JSON column. */
export const POSTGRES_JSON_TEXT_POLICY = {
  storage: 'text',
  empty: 'preserve',
  malformed: 'quarantine',
} as const;

/** Quote a manifest-owned SQL identifier for PostgreSQL. */
export function quotePostgresIdentifier(identifier: PostgresMigrationTable | string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) throw new Error(`Unsafe SQL identifier: ${identifier}`);
  return `"${identifier}"`;
}
