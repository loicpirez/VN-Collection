import { describe, expect, it } from 'vitest';
import {
  decodeClearedStockSnapshot,
  decodeStockAliasesResult,
  decodeStockSnapshot,
} from '../src/lib/stock-api-shape';

const offer = {
  vn_id: 'V90001',
  provider: 'shop',
  provider_label: 'Shop',
  provider_offer_id: 'offer',
  source: 'direct',
  title: 'Entry',
  url: 'https://example.com/item',
  price: 1000,
  currency: 'JPY',
  availability: 'in_stock',
  availability_label: null,
  condition: null,
  edition_label: null,
  location_label: null,
  location_branch: null,
  source_release_id: null,
  jan: null,
  fetched_at: 1,
  error: null,
  content_kind: null,
  platform: null,
  edition_kind: null,
  series_relation: null,
  match_confidence: null,
  match_score: null,
  match_warnings_json: null,
  marketplace_price: null,
  marketplace_count: null,
  list_price: null,
  category: null,
  store_code: null,
  product_id: null,
  page_kind: null,
};

const status = {
  provider: 'shop',
  status: 'ok',
  message: null,
  fetched_at: 1,
  offer_count: 1,
  blocked_kind: null,
  fresh_offers_found: 1,
  cached_offers_available: 0,
  extras_json: null,
};

const provider = {
  id: 'shop',
  label: 'Shop',
  kind: 'direct',
  lookupCapabilities: ['direct_link'],
  resultCapability: 'structured_offers',
  supportLevel: 'supported',
  physical: false,
  physicalStockMode: 'online_only',
  cloudflare: false,
  branchParserImplemented: false,
  confirmedPhysicalUsable: false,
};

const source = {
  id: 1,
  vn_id: 'v90001',
  release_id: null,
  provider: 'shop',
  url: 'https://example.com/item',
  product_id: null,
  created_at: 1,
  updated_at: 1,
};

const summary = {
  total: 1,
  available: 1,
  best_price: 1000,
  related_available: 0,
  needs_review: 0,
  rejected: 0,
  last_refresh: 1,
};

const snapshot = {
  offers: [offer],
  statuses: [status],
  providers: [provider],
  sources: [source],
  summary,
};

describe('stock API response adapters', () => {
  it('decodes a full snapshot and canonicalizes ids', () => {
    expect(decodeStockSnapshot(snapshot)?.offers[0]?.vn_id).toBe('v90001');
    expect(decodeStockSnapshot({ ...snapshot, offers: [{ ...offer, condition: 'used' }] })).not.toBeNull();
  });

  it('decodes alias and clear-cache envelopes', () => {
    expect(decodeStockAliasesResult({ aliases: ['Query'] })).toEqual({ aliases: ['Query'], error: null });
    expect(decodeStockAliasesResult({ error: 'too many', aliases: ['Existing'] })).toEqual({
      aliases: ['Existing'],
      error: 'too many',
    });
    expect(decodeClearedStockSnapshot({ snapshot })?.summary.available).toBe(1);
  });

  it('rejects malformed nested rows and alias envelopes', () => {
    expect(decodeStockSnapshot({ ...snapshot, offers: [{ ...offer, availability: 'bad' }] })).toBeNull();
    expect(decodeStockSnapshot({ ...snapshot, providers: [{ ...provider, physicalStockMode: 'bad' }] })).toBeNull();
    expect(decodeStockAliasesResult({ aliases: [4] })).toBeNull();
    expect(decodeClearedStockSnapshot({ snapshot: null })).toBeNull();
  });

  it('accepts the supported pre-refresh provider state', () => {
    expect(decodeStockSnapshot({ ...snapshot, statuses: [{ ...status, status: 'not_checked' }] })?.statuses[0]?.status).toBe('not_checked');
  });

  it('rejects malformed status, source, summary, and outer containers', () => {
    expect(decodeStockSnapshot(null)).toBeNull();
    expect(decodeStockSnapshot({ ...snapshot, statuses: [{ ...status, offer_count: -1 }] })).toBeNull();
    expect(decodeStockSnapshot({ ...snapshot, sources: [{ ...source, id: 0 }] })).toBeNull();
    expect(decodeStockSnapshot({ ...snapshot, summary: { ...summary, total: -1 } })).toBeNull();
  });

  it('accepts every provider capability enum member and omitted optional provider fields', () => {
    for (const lookupCapability of ['aggregate_price', 'direct_link', 'jan_lookup', 'title_search', 'cached_inventory']) {
      expect(decodeStockSnapshot({
        ...snapshot,
        providers: [{ ...provider, lookupCapabilities: [lookupCapability] }],
      })).not.toBeNull();
    }
    for (const resultCapability of ['structured_prices', 'structured_offers', 'search_leads', 'cached_offers']) {
      expect(decodeStockSnapshot({
        ...snapshot,
        providers: [{ ...provider, resultCapability }],
      })).not.toBeNull();
    }
    for (const supportLevel of ['supported', 'limited', 'manual_only']) {
      expect(decodeStockSnapshot({
        ...snapshot,
        providers: [{ ...provider, supportLevel }],
      })).not.toBeNull();
    }
    for (const physicalStockMode of [
      'none',
      'online_only',
      'single_shop',
      'store_locator_only',
      'phone_only',
      'store_name_online',
      'exact_online',
      'exact_online_possible_not_implemented',
      'exact_online_browser_required',
      'exact_cached',
    ]) {
      expect(decodeStockSnapshot({
        ...snapshot,
        providers: [{ ...provider, physicalStockMode }],
      })).not.toBeNull();
    }
    const { lookupCapabilities: _lookupCapabilities, resultCapability: _resultCapability, supportLevel: _supportLevel, ...minimalProvider } = provider;
    expect(decodeStockSnapshot({ ...snapshot, providers: [minimalProvider] })).not.toBeNull();
    expect(decodeStockSnapshot({ ...snapshot, providers: [{ ...provider, lookupCapabilities: ['bad'] }] })).toBeNull();
    expect(decodeStockSnapshot({ ...snapshot, providers: [{ ...provider, disabled: false }] })).not.toBeNull();
  });

  it('accepts every offer availability and status enum member', () => {
    for (const availability of ['in_stock', 'limited', 'out_of_stock', 'unknown', 'error']) {
      expect(decodeStockSnapshot({ ...snapshot, offers: [{ ...offer, availability }] })).not.toBeNull();
    }
    for (const statusValue of ['ok', 'no_results', 'partial', 'protected', 'error', 'skipped', 'not_checked']) {
      expect(decodeStockSnapshot({ ...snapshot, statuses: [{ ...status, status: statusValue }] })).not.toBeNull();
    }
  });

  it('rejects malformed alias variants', () => {
    expect(decodeStockAliasesResult(null)).toBeNull();
    expect(decodeStockAliasesResult({})).toBeNull();
    expect(decodeStockAliasesResult({ aliases: null, error: 'bad aliases' })).toBeNull();
    expect(decodeStockAliasesResult({ aliases: ['Query'], error: 4 })).toBeNull();
  });
});
