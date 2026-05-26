export type ProviderDiagnosticKind =
  | 'ok'
  | 'no_results'
  | 'blocked'
  | 'protected'
  | 'partial'
  | 'cached'
  | 'missing_source'
  | 'unsupported'
  | 'skipped'
  | 'not_checked'
  | 'network_error'
  | 'parser_error'
  | 'provider_disabled';

export type ProviderDiagnosticGroup =
  | 'attention'
  | 'blocked'
  | 'skipped'
  | 'no_results'
  | 'not_checked';

export interface ProviderDiagnosticMeta {
  id: string;
  label: string;
  cloudflare?: boolean;
  physicalStockMode?: string;
}

export interface ProviderDiagnosticStatus {
  provider: string;
  status: string;
  message: string | null;
  fetched_at?: number | null;
  offer_count?: number | null;
  blocked_kind?: string | null;
  fresh_offers_found?: number | null;
  cached_offers_available?: number | null;
}

export interface NormalizedProviderDiagnostic {
  provider: string;
  label: string;
  kind: ProviderDiagnosticKind;
  group: ProviderDiagnosticGroup;
  tone: 'success' | 'neutral' | 'warning' | 'danger';
  badgeKey: string;
  messageKey: string;
  secondaryKey?: string;
  technicalDetail: string | null;
  offersFound: number;
  freshOffersFound: number;
  cachedOffersAvailable: number;
  fetchedAt: number | null;
}

function hasHttp403(message: string | null | undefined): boolean {
  return /\bHTTP\s*403\b/i.test(message ?? '');
}

function hasBlockingHttpStatus(message: string | null | undefined): boolean {
  // HTTP 4xx (except 404 = no_results) and HTTP 5xx are typically "shop blocked us"
  // signals — not real app errors. 401/403/406/429/451/502/503/504 are the common ones.
  const match = /\bHTTP\s*(\d{3})\b/i.exec(message ?? '');
  if (!match) return false;
  const code = Number(match[1]);
  if (!Number.isFinite(code)) return false;
  if (code === 404) return false; // no_results, not blocked
  if (code === 410) return false; // gone, treat as no_results
  return code >= 400 && code < 600;
}

function hasTransportError(message: string | null | undefined): boolean {
  // Node/undici transport failures often surface as these. Most map to
  // "shop unreachable" rather than an actionable app error.
  return /\b(?:fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH|EAI_AGAIN|ETIMEDOUT|EPIPE|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT)\b|\bnetwork error\b|\bnetwork request failed\b|\bfetch timeout\b|\bAbortError\b|\bThe operation was aborted\b/i.test(message ?? '');
}

function isMissingSource(message: string | null | undefined): boolean {
  return /missing source data|No release link|source URL|source data|JAN|EGS id/i.test(message ?? '');
}

function isCloudflareProtection(message: string | null | undefined): boolean {
  return /cloudflare|protected|challenge/i.test(message ?? '');
}

function blockedMessageKey(provider: string): string {
  if (provider === 'geo') return 'geoBlockedMessage';
  if (provider === 'joshin') return 'joshinBlockedMessage';
  if (provider === 'yodobashi') return 'yodobashiBlockedMessage';
  if (provider === 'amiami') return 'amiamiBlockedMessage';
  return 'blockedByShopMessage';
}

function blockedBadgeKey(provider: string): string {
  if (provider === 'joshin') return 'blockedPhoneBadge';
  return 'blockedByShopBadge';
}

function unreachableMessageKey(provider: string): string {
  if (provider === 'joshin') return 'joshinUnreachableMessage';
  if (provider === 'yodobashi') return 'yodobashiUnreachableMessage';
  return 'unreachableMessage';
}

function skippedMessageKey(provider: string, meta?: ProviderDiagnosticMeta): string {
  if (provider === 'wondergoo' || meta?.physicalStockMode === 'store_locator_only') return 'wondergooUnsupportedMessage';
  if (provider === 'melonbooks') return 'melonbooksMissingSourceMessage';
  return 'missingSourceMessage';
}

export function normalizeProviderDiagnostic(
  meta: ProviderDiagnosticMeta,
  status?: ProviderDiagnosticStatus | null,
  visibleOfferCount = 0,
): NormalizedProviderDiagnostic {
  const offersFound = status?.offer_count ?? visibleOfferCount ?? 0;
  const freshOffersFound = status?.fresh_offers_found ?? offersFound;
  const cachedOffersAvailable = status?.cached_offers_available ?? 0;
  const technicalDetail = status?.message ?? null;

  const base: Omit<NormalizedProviderDiagnostic, 'kind' | 'group' | 'tone' | 'badgeKey' | 'messageKey'> = {
    provider: meta.id,
    label: meta.label,
    secondaryKey: undefined,
    technicalDetail,
    offersFound,
    freshOffersFound,
    cachedOffersAvailable,
    fetchedAt: status?.fetched_at ?? null,
  };

  if (!status) {
    return {
      ...base,
      technicalDetail: null,
      kind: 'not_checked',
      group: 'not_checked',
      tone: 'neutral',
      badgeKey: 'notCheckedBadge',
      messageKey: 'notCheckedMessage',
      offersFound: visibleOfferCount,
      freshOffersFound: 0,
      cachedOffersAvailable: 0,
    };
  }

  if (meta.id === 'surugaya') {
    if ((status.status === 'protected' || isCloudflareProtection(status.message)) && cachedOffersAvailable > 0) {
      return {
        ...base,
        kind: 'cached',
        group: 'blocked',
        tone: 'warning',
        badgeKey: 'cachedBadge',
        messageKey: 'surugayaCachedProtectedMessage',
        secondaryKey: 'latestProtectedNote',
      };
    }
    if (status.status === 'partial' || (offersFound > 0 && (status.status === 'protected' || isCloudflareProtection(status.message)))) {
      return {
        ...base,
        kind: 'partial',
        group: 'blocked',
        tone: 'success',
        badgeKey: 'searchOkBadge',
        messageKey: 'surugayaDetailsProtectedMessage',
        secondaryKey: 'detailsProtectedNote',
      };
    }
    if (status.status === 'protected') {
      return {
        ...base,
        kind: 'protected',
        group: 'blocked',
        tone: 'warning',
        badgeKey: 'protectedBadge',
        messageKey: status.blocked_kind === 'search_page' ? 'surugayaSearchProtectedMessage' : 'protectedMessage',
      };
    }
  }

  if (hasHttp403(status.message) || hasBlockingHttpStatus(status.message)) {
    return {
      ...base,
      kind: 'blocked',
      group: 'blocked',
      tone: 'warning',
      badgeKey: blockedBadgeKey(meta.id),
      messageKey: blockedMessageKey(meta.id),
    };
  }

  if (status.status === 'protected' || isCloudflareProtection(status.message)) {
    return {
      ...base,
      kind: 'protected',
      group: 'blocked',
      tone: 'warning',
      badgeKey: 'protectedBadge',
      messageKey: 'protectedMessage',
    };
  }

  if (status.status === 'skipped' || isMissingSource(status.message)) {
    const unsupported = meta.id === 'wondergoo' || meta.physicalStockMode === 'store_locator_only';
    return {
      ...base,
      kind: unsupported ? 'unsupported' : 'skipped',
      group: 'skipped',
      tone: 'neutral',
      badgeKey: unsupported ? 'unsupportedBadge' : 'skippedBadge',
      messageKey: skippedMessageKey(meta.id, meta),
    };
  }

  if (status.status === 'no_results' || (status.status === 'ok' && offersFound === 0)) {
    return {
      ...base,
      kind: 'no_results',
      group: 'no_results',
      tone: 'neutral',
      badgeKey: 'zeroOffersBadge',
      messageKey: 'noResultsMessage',
    };
  }

  if (status.status === 'error') {
    if (hasTransportError(status.message)) {
      return {
        ...base,
        kind: 'network_error',
        group: 'blocked',
        tone: 'warning',
        badgeKey: 'unreachableBadge',
        messageKey: unreachableMessageKey(meta.id),
      };
    }
    const parser = /parser|parse|invalid html|invalid markup/i.test(status.message ?? '');
    return {
      ...base,
      kind: parser ? 'parser_error' : 'network_error',
      group: 'attention',
      tone: 'danger',
      badgeKey: 'errorBadge',
      messageKey: parser ? 'parserErrorMessage' : 'networkErrorMessage',
    };
  }

  return {
    ...base,
    kind: 'ok',
    group: 'no_results',
    tone: 'success',
    badgeKey: 'okBadge',
    messageKey: 'okMessage',
  };
}
