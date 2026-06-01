import type {
  PhysicalStockMode,
  StockLookupCapability,
  StockResultCapability,
  StockSupportLevel,
} from './stock-provider-capabilities';

/** One cached stock offer exposed to the VN-detail stock panel. */
export interface StockOfferDto {
  vn_id: string;
  provider: string;
  provider_label: string;
  provider_offer_id: string;
  source: string;
  title: string;
  url: string;
  price: number | null;
  currency: string;
  availability: 'in_stock' | 'limited' | 'out_of_stock' | 'unknown' | 'error';
  availability_label: string | null;
  condition: string | null;
  edition_label: string | null;
  location_label: string | null;
  location_branch: string | null;
  source_release_id: string | null;
  jan: string | null;
  fetched_at: number;
  error: string | null;
  content_kind: string | null;
  platform: string | null;
  edition_kind: string | null;
  series_relation: string | null;
  match_confidence: string | null;
  match_score: number | null;
  match_warnings_json: string | null;
  marketplace_price: number | null;
  marketplace_count: number | null;
  list_price: number | null;
  category: string | null;
  store_code: string | null;
  product_id: string | null;
  page_kind: string | null;
}

/** One provider refresh status exposed to the VN-detail stock panel. */
export interface StockStatusDto {
  provider: string;
  status: 'ok' | 'no_results' | 'partial' | 'protected' | 'error' | 'skipped' | 'not_checked';
  message: string | null;
  fetched_at: number;
  offer_count: number;
  blocked_kind: string | null;
  fresh_offers_found: number;
  cached_offers_available: number;
  /** Provider-specific JSON blob such as Eroge Price game bundles. */
  extras_json?: string | null;
}

/** Provider capability metadata exposed to the VN-detail stock panel. */
export interface StockProviderDto {
  id: string;
  label: string;
  kind: 'direct' | 'aggregate' | 'cached';
  lookupCapabilities?: readonly StockLookupCapability[];
  resultCapability?: StockResultCapability;
  supportLevel?: StockSupportLevel;
  physical: boolean;
  physicalStockMode: PhysicalStockMode;
  cloudflare: boolean;
  branchParserImplemented: boolean;
  confirmedPhysicalUsable: boolean;
  disabled?: boolean;
}

/** Manually registered source URL exposed to the VN-detail stock panel. */
export interface StockSourceDto {
  id: number;
  vn_id: string;
  release_id: string | null;
  provider: string;
  url: string;
  product_id: string | null;
  created_at: number;
  updated_at: number;
}

/** Stable API response consumed by the VN-detail stock panel. */
export interface StockSnapshotDto {
  offers: StockOfferDto[];
  statuses: StockStatusDto[];
  providers: StockProviderDto[];
  sources: StockSourceDto[];
  summary: {
    total: number;
    available: number;
    best_price: number | null;
    related_available: number;
    needs_review: number;
    rejected: number;
    last_refresh: number | null;
  };
}
