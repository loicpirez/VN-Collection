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
});
