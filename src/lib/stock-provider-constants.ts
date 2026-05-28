/**
 * Machine-readable sentinel stored in `vn_stock_offer.location_label` when
 * an offer ships online with no branch detail. Never displayed — the UI maps
 * it to `t.stock.onlineStockLabel`. The `__` prefix makes it obviously
 * synthetic and prevents collision with real branch names.
 */
export const ONLINE_STOCK_SENTINEL = '__online_stock__';

/**
 * Client-safe stock provider constants.
 *
 * This module is intentionally NOT marked `server-only` so the Settings UI
 * (`SettingsButton.tsx`, a client component) can render a row per shop
 * provider without bundling the server-only stock fetch / parse code.
 *
 * The canonical implementation lives in `src/lib/stock.ts`; that module
 * re-exports `STOCK_PROVIDER_IDS` / `StockProviderId` from here for
 * back-compat, so consumers can keep importing from `@/lib/stock`.
 */

export const STOCK_PROVIDER_IDS = [
  'eroge_price',
  'sofmap',
  'surugaya',
  'hgame1',
  'melonbooks',
  'mandarake',
  'wondergoo',
  'trader',
  'animate',
  'ebten',
  'getchu',
  'gamers',
  'gamecity',
  'asakusa_mach',
  'amazon_jp',
  'amiami',
  'otakarasouko',
  'geo',
  'joshin',
  'neowing',
  'yodobashi',
  'bikkuri_takarajima',
] as const;

export type StockProviderId = (typeof STOCK_PROVIDER_IDS)[number];

/**
 * Human-readable display label for each provider. Used by the Settings UI
 * and the stock panel chip rendering. Labels are intentionally static
 * strings (not i18n keys) because they are brand names; the surrounding
 * UI copy is translated separately.
 */
export const STOCK_PROVIDER_LABELS: Record<StockProviderId, string> = {
  eroge_price: 'Eroge Price',
  sofmap: 'Sofmap / Recole',
  surugaya: 'Suruga-ya',
  hgame1: 'PC Shop Unoya',
  melonbooks: 'Melonbooks',
  mandarake: 'Mandarake',
  wondergoo: 'WonderGOO',
  trader: 'Trader / 秋葉原トレーダー通販',
  animate: 'Animate',
  ebten: 'ebten',
  getchu: 'Getchu',
  gamers: 'Gamers',
  gamecity: 'GAMECITY',
  asakusa_mach: 'Yahoo Shopping',
  amazon_jp: 'Amazon JP',
  amiami: 'AmiAmi',
  otakarasouko: 'Otakarasouko',
  geo: 'GEO',
  joshin: 'Joshin',
  neowing: 'Neowing',
  yodobashi: 'Yodobashi',
  bikkuri_takarajima: 'Bikkuri Takarajima',
};
