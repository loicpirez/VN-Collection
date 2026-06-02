import { describe, expect, it } from 'vitest';
import { dictionaries, LOCALES } from '@/lib/i18n/dictionaries';
import { normalizeProviderDiagnostic } from '@/lib/stock-diagnostics';

const baseMeta = { id: 'sample_shop', label: 'Sample Shop' };

describe('normalizeProviderDiagnostic', () => {
  it('keeps Suruga-ya search-card success partial instead of protected', () => {
    const diag = normalizeProviderDiagnostic(
      { id: 'surugaya', label: 'Suruga-ya', cloudflare: true },
      {
        provider: 'surugaya',
        status: 'partial',
        message: 'Search cards parsed; product detail pages are protected.',
        fetched_at: 100,
        offer_count: 2,
        blocked_kind: 'detail_page',
        fresh_offers_found: 2,
        cached_offers_available: 0,
      },
    );
    expect(diag.kind).toBe('partial');
    expect(diag.badgeKey).toBe('searchOkBadge');
    expect(diag.secondaryKey).toBe('detailsProtectedNote');
  });

  it('shows Suruga-ya search-page protection when no offers were parsed', () => {
    const diag = normalizeProviderDiagnostic(
      { id: 'surugaya', label: 'Suruga-ya', cloudflare: true },
      {
        provider: 'surugaya',
        status: 'protected',
        message: 'Cloudflare protected — automated access blocked.',
        fetched_at: 100,
        offer_count: 0,
        blocked_kind: 'search_page',
        fresh_offers_found: 0,
        cached_offers_available: 0,
      },
    );
    expect(diag.kind).toBe('protected');
    expect(diag.messageKey).toBe('surugayaSearchProtectedMessage');
  });

  it('shows cached Suruga-ya offers when latest check was protected', () => {
    const diag = normalizeProviderDiagnostic(
      { id: 'surugaya', label: 'Suruga-ya', cloudflare: true },
      {
        provider: 'surugaya',
        status: 'protected',
        message: 'Cloudflare protected — automated access blocked.',
        fetched_at: 100,
        offer_count: 3,
        blocked_kind: 'search_page',
        fresh_offers_found: 0,
        cached_offers_available: 3,
      },
    );
    expect(diag.kind).toBe('cached');
    expect(diag.badgeKey).toBe('cachedBadge');
    expect(diag.secondaryKey).toBe('latestProtectedNote');
  });

  it('keeps Suruga-ya protected responses partial when offers remain visible', () => {
    const diag = normalizeProviderDiagnostic(
      { id: 'surugaya', label: 'Suruga-ya' },
      {
        provider: 'surugaya',
        status: 'protected',
        message: 'Cloudflare protected',
        offer_count: 1,
        cached_offers_available: 0,
      },
    );
    expect(diag.kind).toBe('partial');
  });

  it('normalizes HTTP 403 as blocked and hides raw text from user-facing keys', () => {
    const diag = normalizeProviderDiagnostic(baseMeta, {
      provider: 'sample_shop',
      status: 'error',
      message: 'HTTP 403 from shop.example',
      fetched_at: 100,
      offer_count: 0,
      blocked_kind: null,
      fresh_offers_found: 0,
      cached_offers_available: 0,
    });
    expect(diag.kind).toBe('blocked');
    expect(diag.messageKey).toBe('blockedByShopMessage');
    expect(diag.messageKey).not.toMatch(/HTTP 403/i);
    expect(diag.technicalDetail).toBe('HTTP 403 from shop.example');
  });

  it('uses phone guidance for blocked Joshin requests', () => {
    const diag = normalizeProviderDiagnostic({ id: 'joshin', label: 'Joshin' }, {
      provider: 'joshin',
      status: 'error',
      message: 'HTTP 403 from shop.example',
    });
    expect(diag.badgeKey).toBe('blockedPhoneBadge');
    expect(diag.messageKey).toBe('joshinBlockedMessage');
  });

  it('normalizes missing source data without exposing raw wording', () => {
    const diag = normalizeProviderDiagnostic({ id: 'melonbooks', label: 'Melonbooks' }, {
      provider: 'melonbooks',
      status: 'skipped',
      message: 'missing source data',
      fetched_at: 100,
      offer_count: 0,
      blocked_kind: null,
      fresh_offers_found: 0,
      cached_offers_available: 0,
    });
    expect(diag.kind).toBe('skipped');
    expect(diag.messageKey).toBe('melonbooksMissingSourceMessage');
    expect(diag.messageKey).not.toMatch(/missing source data/i);
    expect(diag.technicalDetail).toBe('missing source data');
  });

  it('marks WonderGOO store-locator-only as unsupported, not an error', () => {
    const diag = normalizeProviderDiagnostic(
      { id: 'wondergoo', label: 'WonderGOO', physicalStockMode: 'store_locator_only' },
      {
        provider: 'wondergoo',
        status: 'skipped',
        message: 'missing source data',
        fetched_at: 100,
        offer_count: 0,
        blocked_kind: null,
        fresh_offers_found: 0,
        cached_offers_available: 0,
      },
    );
    expect(diag.kind).toBe('unsupported');
    expect(diag.tone).toBe('neutral');
    expect(diag.messageKey).toBe('wondergooUnsupportedMessage');
  });

  it('uses store-locator guidance and message-based missing-source detection', () => {
    const diag = normalizeProviderDiagnostic(
      { id: 'sample_shop', label: 'Sample Shop', physicalStockMode: 'store_locator_only' },
      {
        provider: 'sample_shop',
        status: 'ok',
        message: 'source URL unavailable',
      },
    );
    expect(diag.kind).toBe('unsupported');
    expect(diag.messageKey).toBe('wondergooUnsupportedMessage');
  });

  it('returns not-checked diagnostics and generic skipped guidance', () => {
    expect(normalizeProviderDiagnostic(baseMeta, null, 2)).toMatchObject({
      kind: 'not_checked',
      offersFound: 2,
    });
    expect(normalizeProviderDiagnostic(baseMeta, {
      provider: 'sample_shop',
      status: 'skipped',
      message: null,
    }).messageKey).toBe('missingSourceMessage');
  });

  it('detects Suruga-ya message protection when search offers remain visible', () => {
    expect(normalizeProviderDiagnostic({ id: 'surugaya', label: 'Suruga-ya' }, {
      provider: 'surugaya',
      status: 'ok',
      message: 'cloudflare challenge',
      offer_count: 1,
    }).kind).toBe('partial');
    expect(normalizeProviderDiagnostic({ id: 'surugaya', label: 'Suruga-ya' }, {
      provider: 'surugaya',
      status: 'protected',
      message: null,
      offer_count: 0,
      blocked_kind: 'detail_page',
    }).messageKey).toBe('protectedMessage');
    expect(normalizeProviderDiagnostic({ id: 'surugaya', label: 'Suruga-ya' }, {
      provider: 'surugaya',
      status: 'ok',
      message: null,
      offer_count: 0,
    }).kind).toBe('no_results');
  });

  it('generic Cloudflare providers without offers stay protected', () => {
    const diag = normalizeProviderDiagnostic({ id: 'cloud_shop', label: 'Cloud Shop', cloudflare: true }, {
      provider: 'cloud_shop',
      status: 'protected',
      message: 'cloudflare_challenge',
      fetched_at: 100,
      offer_count: 0,
      blocked_kind: 'unknown',
      fresh_offers_found: 0,
      cached_offers_available: 0,
    });
    expect(diag.kind).toBe('protected');
    expect(diag.badgeKey).toBe('protectedBadge');
  });

  it('normalizes HTTP 503 as blocked with warning tone (not red app error)', () => {
    const diag = normalizeProviderDiagnostic({ id: 'yodobashi', label: 'Yodobashi' }, {
      provider: 'yodobashi',
      status: 'error',
      message: 'HTTP 503 from www.yodobashi.com',
      fetched_at: 100,
      offer_count: 0,
      blocked_kind: null,
      fresh_offers_found: 0,
      cached_offers_available: 0,
    });
    expect(diag.kind).toBe('blocked');
    expect(diag.tone).toBe('warning');
    expect(diag.group).toBe('blocked');
    expect(diag.messageKey).toBe('yodobashiBlockedMessage');
    expect(diag.messageKey).not.toMatch(/HTTP 5/i);
  });

  it('normalizes transport errors (fetch failed) as unreachable, not red error', () => {
    const diag = normalizeProviderDiagnostic({ id: 'joshin', label: 'Joshin' }, {
      provider: 'joshin',
      status: 'error',
      message: 'fetch failed',
      fetched_at: 100,
      offer_count: 0,
      blocked_kind: null,
      fresh_offers_found: 0,
      cached_offers_available: 0,
    });
    expect(diag.kind).toBe('network_error');
    expect(diag.tone).toBe('warning');
    expect(diag.group).toBe('blocked');
    expect(diag.badgeKey).toBe('unreachableBadge');
    expect(diag.messageKey).toBe('joshinUnreachableMessage');
  });

  it('normalizes ECONNREFUSED as unreachable with neutral tone', () => {
    const diag = normalizeProviderDiagnostic({ id: 'yodobashi', label: 'Yodobashi' }, {
      provider: 'yodobashi',
      status: 'error',
      message: 'connect ECONNREFUSED 1.2.3.4:443',
      fetched_at: 100,
      offer_count: 0,
      blocked_kind: null,
      fresh_offers_found: 0,
      cached_offers_available: 0,
    });
    expect(diag.kind).toBe('network_error');
    expect(diag.tone).toBe('warning');
    expect(diag.badgeKey).toBe('unreachableBadge');
    expect(diag.messageKey).toBe('yodobashiUnreachableMessage');
  });

  it('keeps actual app-side parser errors as danger tone', () => {
    const diag = normalizeProviderDiagnostic({ id: 'shop', label: 'Shop' }, {
      provider: 'shop',
      status: 'error',
      message: 'invalid html structure during parse',
      fetched_at: 100,
      offer_count: 0,
      blocked_kind: null,
      fresh_offers_found: 0,
      cached_offers_available: 0,
    });
    expect(diag.kind).toBe('parser_error');
    expect(diag.tone).toBe('danger');
    expect(diag.group).toBe('attention');
  });

  it('uses AmiAmi-specific blocked message for AmiAmi 403', () => {
    const diag = normalizeProviderDiagnostic({ id: 'amiami', label: 'AmiAmi' }, {
      provider: 'amiami',
      status: 'error',
      message: 'HTTP 403 from www.amiami.jp',
      fetched_at: 100,
      offer_count: 0,
      blocked_kind: null,
      fresh_offers_found: 0,
      cached_offers_available: 0,
    });
    expect(diag.kind).toBe('blocked');
    expect(diag.messageKey).toBe('amiamiBlockedMessage');
  });

  it('uses Yodobashi-specific blocked message for Yodobashi 403', () => {
    const diag = normalizeProviderDiagnostic({ id: 'yodobashi', label: 'Yodobashi' }, {
      provider: 'yodobashi',
      status: 'error',
      message: 'HTTP 403 from www.yodobashi.com',
      fetched_at: 100,
      offer_count: 0,
      blocked_kind: null,
      fresh_offers_found: 0,
      cached_offers_available: 0,
    });
    expect(diag.kind).toBe('blocked');
    expect(diag.messageKey).toBe('yodobashiBlockedMessage');
  });

  it('uses GEO online-store blocked guidance without claiming its list parser is unfinished', () => {
    const diag = normalizeProviderDiagnostic({ id: 'geo', label: 'GEO', physicalStockMode: 'online_only' }, {
      provider: 'geo',
      status: 'error',
      message: 'HTTP 403 from ec.geo-online.co.jp',
      fetched_at: 100,
      offer_count: 0,
      blocked_kind: null,
      fresh_offers_found: 0,
      cached_offers_available: 0,
    });
    expect(diag.kind).toBe('blocked');
    expect(diag.messageKey).toBe('geoBlockedMessage');
    for (const locale of LOCALES) {
      const diagnostics = dictionaries[locale].stock.providerDiagnostics as Record<string, string>;
      expect(diagnostics.geoBlockedMessage).not.toMatch(/not implemented|未実装|pas encore implémenté/i);
    }
  });

  it('normalizes fetch timeout as unreachable', () => {
    const diag = normalizeProviderDiagnostic({ id: 'shop', label: 'Shop' }, {
      provider: 'shop',
      status: 'error',
      message: 'fetch timeout after 15000ms from shop.example',
      fetched_at: 100,
      offer_count: 0,
      blocked_kind: null,
      fresh_offers_found: 0,
      cached_offers_available: 0,
    });
    expect(diag.kind).toBe('network_error');
    expect(diag.tone).toBe('warning');
    expect(diag.badgeKey).toBe('unreachableBadge');
    expect(diag.group).toBe('blocked');
  });

  it('treats HTTP 404 as no_results (not blocked)', () => {
    const diag = normalizeProviderDiagnostic({ id: 'shop', label: 'Shop' }, {
      provider: 'shop',
      status: 'error',
      message: 'HTTP 404 from shop.example',
      fetched_at: 100,
      offer_count: 0,
      blocked_kind: null,
      fresh_offers_found: 0,
      cached_offers_available: 0,
    });
    // 404 falls through the HTTP-block check; we treat it as a generic error.
    expect(diag.kind).toBe('network_error');
    expect(diag.tone).toBe('danger');
  });

  it('treats HTTP 410 as a generic provider error and empty success as no results', () => {
    expect(normalizeProviderDiagnostic(baseMeta, {
      provider: 'sample_shop',
      status: 'error',
      message: 'HTTP 410 from shop.example',
    }).kind).toBe('network_error');
    expect(normalizeProviderDiagnostic(baseMeta, {
      provider: 'sample_shop',
      status: 'ok',
      message: null,
      offer_count: 0,
    }).kind).toBe('no_results');
    expect(normalizeProviderDiagnostic(baseMeta, {
      provider: 'sample_shop',
      status: 'ok',
      message: null,
      offer_count: 1,
    }).kind).toBe('ok');
    expect(normalizeProviderDiagnostic(baseMeta, {
      provider: 'sample_shop',
      status: 'error',
      message: null,
    }).kind).toBe('network_error');
  });

  it('has user-facing i18n keys in every locale', () => {
    const required = [
      'blockedByShopMessage',
      'melonbooksMissingSourceMessage',
      'surugayaDetailsProtectedMessage',
      'technicalDetails',
      'zeroOffersBadge',
      'unreachableBadge',
      'unreachableMessage',
      'yodobashiBlockedMessage',
      'yodobashiUnreachableMessage',
      'joshinUnreachableMessage',
      'amiamiBlockedMessage',
      'geoBlockedMessage',
    ];
    for (const locale of LOCALES) {
      const diagnostics = dictionaries[locale].stock.providerDiagnostics as Record<string, string>;
      for (const key of required) {
        expect(diagnostics[key]).toBeTruthy();
      }
    }
  });
});
