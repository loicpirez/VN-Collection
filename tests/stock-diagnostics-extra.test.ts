/**
 * Fills the normalizeProviderDiagnostic branches the main diagnostics suite
 * leaves open: the no-status not_checked path, HTTP 410 treated as
 * no-blocking, the joshin blocked-badge and generic skipped-message
 * defaults, the surugaya offers-with-protected partial path, the ok and
 * cached-offer count fields, and the plain ok terminal return.
 */
import { describe, expect, it } from 'vitest';
import { normalizeProviderDiagnostic } from '@/lib/stock-diagnostics';

const meta = { id: 'sample_shop', label: 'Sample Shop' };

function status(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'sample_shop',
    status: 'ok',
    message: null,
    fetched_at: 100,
    offer_count: 0,
    blocked_kind: null,
    fresh_offers_found: 0,
    cached_offers_available: 0,
    ...overrides,
  } as Parameters<typeof normalizeProviderDiagnostic>[1];
}

describe('normalizeProviderDiagnostic — base cases', () => {
  it('returns not_checked with neutral tone when no status row exists', () => {
    const diag = normalizeProviderDiagnostic(meta, null, 7);
    expect(diag.kind).toBe('not_checked');
    expect(diag.group).toBe('not_checked');
    expect(diag.tone).toBe('neutral');
    expect(diag.offersFound).toBe(7);
    expect(diag.technicalDetail).toBeNull();
  });

  it('returns ok with success tone and counts for an ok status with offers', () => {
    const diag = normalizeProviderDiagnostic(meta, status({
      status: 'ok',
      offer_count: 3,
      fresh_offers_found: 3,
      cached_offers_available: 1,
    }));
    expect(diag.kind).toBe('ok');
    expect(diag.tone).toBe('success');
    expect(diag.offersFound).toBe(3);
    expect(diag.freshOffersFound).toBe(3);
    expect(diag.cachedOffersAvailable).toBe(1);
  });

  it('defaults freshOffersFound to offersFound when the field is absent', () => {
    const diag = normalizeProviderDiagnostic(meta, {
      provider: 'sample_shop',
      status: 'ok',
      message: null,
      fetched_at: 100,
      offer_count: 5,
    } as Parameters<typeof normalizeProviderDiagnostic>[1]);
    expect(diag.offersFound).toBe(5);
    expect(diag.freshOffersFound).toBe(5);
  });
});

describe('normalizeProviderDiagnostic — HTTP status edges', () => {
  it('treats HTTP 410 as no-blocking and falls through to a generic error', () => {
    const diag = normalizeProviderDiagnostic(meta, status({
      status: 'error',
      message: 'HTTP 410 from sample.shop',
    }));
    expect(diag.kind).not.toBe('blocked');
    expect(['network_error', 'parser_error']).toContain(diag.kind);
  });
});

describe('normalizeProviderDiagnostic — skipped/blocked defaults', () => {
  it('uses the joshin blocked-phone badge for a joshin HTTP 403', () => {
    const diag = normalizeProviderDiagnostic({ id: 'joshin', label: 'Joshin' }, status({
      provider: 'joshin',
      status: 'error',
      message: 'HTTP 403 from joshinweb.jp',
    }));
    expect(diag.kind).toBe('blocked');
    expect(diag.badgeKey).toBe('blockedPhoneBadge');
  });

  it('uses the generic missing-source message for a skipped non-special provider', () => {
    const diag = normalizeProviderDiagnostic(meta, status({ status: 'skipped' }));
    expect(diag.kind).toBe('skipped');
    expect(diag.badgeKey).toBe('skippedBadge');
    expect(diag.messageKey).toBe('missingSourceMessage');
  });
});

describe('normalizeProviderDiagnostic — surugaya partial via offers + protected', () => {
  it('marks surugaya as partial when offers exist on an otherwise-protected check', () => {
    const diag = normalizeProviderDiagnostic({ id: 'surugaya', label: 'Suruga-ya', cloudflare: true }, status({
      provider: 'surugaya',
      status: 'protected',
      message: null,
      offer_count: 2,
      fresh_offers_found: 2,
      cached_offers_available: 0,
    }));
    expect(diag.kind).toBe('partial');
    expect(diag.badgeKey).toBe('searchOkBadge');
  });
});
