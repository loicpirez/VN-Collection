import {
  ONLINE_STOCK_SENTINEL,
  type StockProviderId,
} from './stock-provider-constants';

/** Physical-store evidence a provider can return from its current integration. */
export type PhysicalStockMode =
  | 'none'
  | 'online_only'
  | 'single_shop'
  | 'store_locator_only'
  | 'phone_only'
  | 'store_name_online'
  | 'exact_online'
  | 'exact_online_possible_not_implemented'
  | 'exact_online_browser_required'
  | 'exact_cached';

/** Input strategies that can produce a target for one stock provider. */
export type StockLookupCapability =
  | 'aggregate_price'
  | 'direct_link'
  | 'jan_lookup'
  | 'title_search'
  | 'cached_inventory';

/** Shape of the result that the current provider integration can return. */
export type StockResultCapability =
  | 'structured_prices'
  | 'structured_offers'
  | 'search_leads'
  | 'cached_offers';

/** Current confidence level of the implemented provider integration. */
export type StockSupportLevel = 'supported' | 'limited' | 'manual_only';

export interface StockProviderMeta {
  id: StockProviderId | 'alicenet';
  label: string;
  kind: 'direct' | 'aggregate' | 'cached';
  /** Input strategies supported by the current provider integration. */
  lookupCapabilities: readonly StockLookupCapability[];
  /** Result shape returned by the current provider integration. */
  resultCapability: StockResultCapability;
  /** Whether the integration is complete, constrained, or manual-link only. */
  supportLevel: StockSupportLevel;
  /** True when this provider can help with physical buying. Not necessarily confirmed exact stock. */
  physical: boolean;
  /** Describes what kind of physical stock evidence the provider can produce. */
  physicalStockMode: PhysicalStockMode;
  /** True when normal server-side fetch is likely blocked or unreliable. */
  cloudflare: boolean;
  /** Whether the current parser actually extracts branch/store-level stock. */
  branchParserImplemented: boolean;
  /** Whether this provider should appear in confirmed-physical-location results right now. */
  confirmedPhysicalUsable: boolean;
  /** True when the operator has disabled this provider in settings. Absent means enabled. */
  disabled?: boolean;
}

/** All providers with physical presence. Not all produce confirmed stock data yet. */
export const PHYSICAL_CAPABLE_PROVIDER_IDS: ReadonlyArray<StockProviderId> = [
  'sofmap', 'surugaya', 'hgame1', 'mandarake', 'wondergoo',
  'animate', 'otakarasouko', 'geo', 'joshin', 'yodobashi', 'bikkuri_takarajima',
] as const;

/** Providers whose parsers currently return confirmed per-branch stock. */
export const CONFIRMED_PHYSICAL_PROVIDER_IDS: ReadonlyArray<StockProviderId> = [
  'sofmap', 'hgame1',
] as const;

/** Providers that cannot produce confirmed physical stock information right now. */
export const USELESS_FOR_CONFIRMED_PHYSICAL_STOCK: ReadonlyArray<StockProviderId> = [
  'wondergoo', 'otakarasouko', 'bikkuri_takarajima', 'joshin',
  'melonbooks', 'ebten', 'getchu', 'gamers', 'gamecity',
  'asakusa_mach', 'amazon_jp', 'amiami', 'neowing',
] as const;

/** Canonical provider capability catalogue shared by server and client DTOs. */
export const STOCK_PROVIDERS: readonly StockProviderMeta[] = [
  { id: 'eroge_price',        label: 'Eroge Price',        kind: 'aggregate', lookupCapabilities: ['aggregate_price', 'title_search'],                resultCapability: 'structured_prices', supportLevel: 'supported',   physical: false, physicalStockMode: 'none',                                   cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'sofmap',             label: 'Sofmap / Recole',    kind: 'direct',    lookupCapabilities: ['direct_link', 'jan_lookup', 'title_search'],          resultCapability: 'structured_offers', supportLevel: 'supported',   physical: true,  physicalStockMode: 'exact_online',                           cloudflare: false, branchParserImplemented: true,  confirmedPhysicalUsable: true  },
  { id: 'surugaya',           label: 'Suruga-ya',          kind: 'direct',    lookupCapabilities: ['title_search'],                                      resultCapability: 'structured_offers', supportLevel: 'limited',     physical: true,  physicalStockMode: 'exact_online_browser_required',          cloudflare: true,  branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'hgame1',             label: 'PC Shop Unoya',      kind: 'direct',    lookupCapabilities: ['direct_link', 'jan_lookup', 'title_search'],          resultCapability: 'structured_offers', supportLevel: 'supported',   physical: true,  physicalStockMode: 'single_shop',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: true  },
  { id: 'melonbooks',         label: 'Melonbooks',         kind: 'direct',    lookupCapabilities: ['direct_link', 'title_search'],                       resultCapability: 'structured_offers', supportLevel: 'supported',   physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'mandarake',          label: 'Mandarake',          kind: 'direct',    lookupCapabilities: ['direct_link', 'jan_lookup', 'title_search'],          resultCapability: 'structured_offers', supportLevel: 'supported',   physical: true,  physicalStockMode: 'store_name_online',                      cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'wondergoo',          label: 'WonderGOO',          kind: 'direct',    lookupCapabilities: ['direct_link'],                                      resultCapability: 'structured_offers', supportLevel: 'limited',     physical: true,  physicalStockMode: 'store_locator_only',                     cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'trader',             label: 'Trader / 秋葉原トレーダー通販', kind: 'direct', lookupCapabilities: ['title_search'],                               resultCapability: 'structured_offers', supportLevel: 'supported',   physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'animate',            label: 'Animate',            kind: 'direct',    lookupCapabilities: ['direct_link', 'jan_lookup', 'title_search'],          resultCapability: 'structured_offers', supportLevel: 'supported',   physical: true,  physicalStockMode: 'exact_online_possible_not_implemented',  cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'ebten',              label: 'ebten',              kind: 'direct',    lookupCapabilities: ['direct_link', 'title_search'],                       resultCapability: 'structured_offers', supportLevel: 'supported',   physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'getchu',             label: 'Getchu',             kind: 'direct',    lookupCapabilities: ['direct_link', 'jan_lookup', 'title_search'],          resultCapability: 'structured_offers', supportLevel: 'supported',   physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'gamers',             label: 'Gamers',             kind: 'direct',    lookupCapabilities: ['direct_link', 'title_search'],                       resultCapability: 'structured_offers', supportLevel: 'supported',   physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'gamecity',           label: 'GAMECITY',           kind: 'direct',    lookupCapabilities: ['direct_link', 'title_search'],                       resultCapability: 'search_leads',      supportLevel: 'manual_only', physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'asakusa_mach',       label: 'Yahoo Shopping',     kind: 'direct',    lookupCapabilities: ['direct_link', 'jan_lookup', 'title_search'],          resultCapability: 'structured_offers', supportLevel: 'supported',   physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'amazon_jp',          label: 'Amazon JP',          kind: 'direct',    lookupCapabilities: ['direct_link', 'jan_lookup', 'title_search'],          resultCapability: 'structured_offers', supportLevel: 'supported',   physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'amiami',             label: 'AmiAmi',             kind: 'direct',    lookupCapabilities: ['direct_link', 'title_search'],                       resultCapability: 'search_leads',      supportLevel: 'manual_only', physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'otakarasouko',       label: 'Otakarasouko',       kind: 'direct',    lookupCapabilities: ['direct_link', 'title_search'],                       resultCapability: 'structured_offers', supportLevel: 'supported',   physical: true,  physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'geo',                label: 'GEO',                kind: 'direct',    lookupCapabilities: ['direct_link', 'title_search'],                       resultCapability: 'structured_offers', supportLevel: 'supported',   physical: true,  physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'joshin',             label: 'Joshin',             kind: 'direct',    lookupCapabilities: ['direct_link', 'jan_lookup', 'title_search'],          resultCapability: 'structured_offers', supportLevel: 'supported',   physical: true,  physicalStockMode: 'phone_only',                             cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'neowing',            label: 'Neowing',            kind: 'direct',    lookupCapabilities: ['direct_link', 'jan_lookup', 'title_search'],          resultCapability: 'search_leads',      supportLevel: 'manual_only', physical: false, physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'yodobashi',          label: 'Yodobashi',          kind: 'direct',    lookupCapabilities: ['direct_link', 'jan_lookup', 'title_search'],          resultCapability: 'structured_offers', supportLevel: 'supported',   physical: true,  physicalStockMode: 'exact_online_possible_not_implemented',  cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'bikkuri_takarajima', label: 'Bikkuri Takarajima', kind: 'direct',    lookupCapabilities: ['direct_link', 'title_search'],                       resultCapability: 'structured_offers', supportLevel: 'supported',   physical: true,  physicalStockMode: 'online_only',                            cloudflare: false, branchParserImplemented: false, confirmedPhysicalUsable: false },
  { id: 'alicenet',     label: 'AliceNet',      kind: 'cached',    lookupCapabilities: ['cached_inventory'],                                  resultCapability: 'cached_offers',     supportLevel: 'supported',   physical: true,  physicalStockMode: 'exact_cached',                           cloudflare: false, branchParserImplemented: true,  confirmedPhysicalUsable: true  },
];

/** Look up one stock provider's metadata row. */
export function getProviderMeta(id: StockProviderId | 'alicenet'): StockProviderMeta | undefined {
  return STOCK_PROVIDERS.find((provider) => provider.id === id);
}

/** Whether provider data can show a confirmed physical SKU. */
export function canProduceConfirmedPhysicalStock(id: StockProviderId | 'alicenet'): boolean {
  return !!getProviderMeta(id)?.confirmedPhysicalUsable;
}

/** Whether a provider can surface a potentially useful physical-stock lead. */
export function canProducePotentialPhysicalLead(id: StockProviderId | 'alicenet'): boolean {
  const meta = getProviderMeta(id);
  if (!meta?.physical) return false;
  const potentialModes: ReadonlyArray<PhysicalStockMode> = [
    'single_shop', 'store_locator_only', 'phone_only', 'store_name_online',
    'exact_online', 'exact_online_possible_not_implemented',
    'exact_online_browser_required', 'exact_cached',
  ];
  return potentialModes.includes(meta.physicalStockMode);
}

interface StockPhysicalOffer {
  provider: string;
  availability: 'in_stock' | 'limited' | 'out_of_stock' | 'unknown' | 'error';
  location_label?: string | null;
}

/** Whether one offer belongs in confirmed physical-location results. */
export function shouldShowInConfirmedPhysicalResults(offer: StockPhysicalOffer): boolean {
  if (!canProduceConfirmedPhysicalStock(offer.provider as StockProviderId | 'alicenet')) return false;
  if (offer.availability !== 'in_stock' && offer.availability !== 'limited') return false;
  return !!offer.location_label && offer.location_label !== ONLINE_STOCK_SENTINEL;
}

/** Whether one offer belongs in potential physical-location leads. */
export function shouldShowAsPhysicalLead(offer: StockPhysicalOffer): boolean {
  const meta = getProviderMeta(offer.provider as StockProviderId | 'alicenet');
  if (!meta?.physical) return false;
  return offer.availability !== 'out_of_stock';
}
