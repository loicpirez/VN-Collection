import 'server-only';
import { getAppSettingRepository } from './db/repositories/app-setting';
import { ALICENET_PROVIDER_ID } from './stock-provider-constants';

export type ProxyProtocol = 'http' | 'https' | 'socks5' | 'socks5h';
/**
 * `stock` is a catch-all for every shop provider in `src/lib/stock.ts`
 * (Sofmap, Suruga-ya, AmiAmi, …). When configured, the proxy is applied to
 * every outbound `fetchShopText` call that does NOT already have a more
 * specific per-shop override.
 *
 * Per-shop overrides live under arbitrary provider ids (any string matching
 * `[a-z][a-z0-9_]+`) — `resolveStockProviderProxy(<id>)` looks up
 * `<id>_proxy_config` and falls back to `stock_proxy_config` if absent. The
 * fixed `ProviderId` enum below stays minimal so the type system can model
 * the four core providers; the per-shop layer is by-string lookup.
 */
export type ProviderId = 'vndb' | 'vndbmirror' | 'egs' | 'alicenet' | 'stock';

/** Per-shop provider id (free-form, matches `StockProviderId` in stock.ts). */
export type StockProxyProviderId = string;

export interface ProxyConfig {
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
}

/** Returned by the settings GET route — password is never echoed. */
export interface ProxyDisplayConfig {
  enabled: boolean;
  protocol: ProxyProtocol;
  host: string;
  port: number | null;
  username: string;
  hasPassword: boolean;
}

export const PROXY_PASSWORD_MASK = '••••••••';

type EnvBackedProviderId = Exclude<ProviderId, 'alicenet'>;

const ENV_PREFIX: Record<EnvBackedProviderId, string> = {
  vndb: 'VNDB',
  vndbmirror: 'VNDBMIRROR',
  egs: 'EGS',
  stock: 'STOCK',
};

export const PROXY_DB_KEY: Record<ProviderId, string> = {
  vndb: 'vndb_proxy_config',
  vndbmirror: 'vndbmirror_proxy_config',
  egs: 'egs_proxy_config',
  alicenet: 'alicenet_proxy_config',
  stock: 'stock_proxy_config',
};

interface StoredProxyConfig {
  enabled?: boolean;
  protocol?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
}

const VALID_PROTOCOLS = new Set<string>(['http', 'https', 'socks5', 'socks5h']);

function sanitizeStoredProxyConfig(value: unknown): StoredProxyConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const config: StoredProxyConfig = {};
  if (typeof raw.enabled === 'boolean') config.enabled = raw.enabled;
  if (typeof raw.protocol === 'string') config.protocol = raw.protocol;
  if (typeof raw.host === 'string') config.host = raw.host;
  if (typeof raw.port === 'number' && Number.isInteger(raw.port)) config.port = raw.port;
  if (typeof raw.username === 'string') config.username = raw.username;
  if (typeof raw.password === 'string') config.password = raw.password;
  return config;
}

async function readDbConfig(provider: ProviderId): Promise<StoredProxyConfig> {
  const raw = await getAppSettingRepository().get(PROXY_DB_KEY[provider]);
  if (!raw) return {};
  try {
    return sanitizeStoredProxyConfig(JSON.parse(raw));
  } catch {
    return {};
  }
}

async function readDbConfigByKey(key: string): Promise<StoredProxyConfig> {
  const raw = await getAppSettingRepository().get(key);
  if (!raw) return {};
  try {
    return sanitizeStoredProxyConfig(JSON.parse(raw));
  } catch {
    return {};
  }
}

function resolveFromStored(envPrefix: string | null, db: StoredProxyConfig): ProxyConfig | null {
  const enabledEnv = envPrefix ? process.env[`${envPrefix}_PROXY_ENABLED`] : undefined;
  const enabled =
    enabledEnv != null
      ? enabledEnv === 'true' || enabledEnv === '1'
      : db.enabled === true;
  if (!enabled) return null;
  const host = (envPrefix ? process.env[`${envPrefix}_PROXY_HOST`] : undefined) ?? db.host ?? '';
  if (!host) return null;
  const portStr = (envPrefix ? process.env[`${envPrefix}_PROXY_PORT`] : undefined) ?? String(db.port ?? '');
  const port = Number(portStr);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const rawProtocol = (envPrefix ? process.env[`${envPrefix}_PROXY_PROTOCOL`] : undefined) ?? db.protocol ?? 'socks5h';
  if (!VALID_PROTOCOLS.has(rawProtocol)) return null;
  const username = (envPrefix ? process.env[`${envPrefix}_PROXY_USERNAME`] : undefined) ?? db.username ?? null;
  const password = (envPrefix ? process.env[`${envPrefix}_PROXY_PASSWORD`] : undefined) ?? db.password ?? null;
  return {
    protocol: rawProtocol as ProxyProtocol,
    host,
    port,
    username: username || null,
    password: password || null,
  };
}

/**
 * Resolves the active proxy configuration for a provider.
 * Env vars take priority over DB settings for fixed network providers.
 * AliceNet is stock-owned and intentionally ignores direct proxy resolution.
 * Returns null when disabled or incomplete.
 * Never logs the returned config — it contains credentials.
 */
export async function resolveProxyConfig(provider: ProviderId): Promise<ProxyConfig | null> {
  if (provider === ALICENET_PROVIDER_ID) return null;
  const envPrefix = ENV_PREFIX[provider as EnvBackedProviderId];
  return resolveFromStored(envPrefix, await readDbConfig(provider));
}

/**
 * Two-tier proxy resolution for stock providers:
 *   1. Per-shop override at `<providerId>_proxy_config`, if enabled.
 *   2. Generic `stock_proxy_config`, if enabled.
 *   3. null — direct connection.
 *
 * AliceNet is a cached stock provider, but it only uses the stored
 * `stock_proxy_config` row. It intentionally ignores direct AliceNet
 * settings and fixed-provider stock environment settings.
 *
 * The two-tier system lets the operator route ONE bot-blocked shop
 * (AmiAmi, Suruga-ya, GEO) through a separate proxy without having to
 * funnel every other shop through it.
 */
export async function resolveStockProviderProxy(providerId: StockProxyProviderId): Promise<ProxyConfig | null> {
  // Sanity-check the provider id so we never look up arbitrary keys.
  if (!/^[a-z][a-z0-9_]*$/.test(providerId)) return resolveProxyConfig('stock');
  if (providerId === ALICENET_PROVIDER_ID) {
    return resolveFromStored(null, await readDbConfig('stock'));
  }
  const envPrefix = providerId.toUpperCase();
  const dbKey = `${providerId}_proxy_config`;
  const perShop = resolveFromStored(envPrefix, await readDbConfigByKey(dbKey));
  if (perShop) return perShop;
  return resolveProxyConfig('stock');
}

/**
 * True when a proxy (per-shop override or the generic `stock` proxy) is
 * active for this provider. Lets the stock refresh decide whether a
 * direct-connection retry is meaningful without exposing credentials.
 */
export async function isStockProviderProxied(providerId: StockProxyProviderId): Promise<boolean> {
  return (await resolveStockProviderProxy(providerId)) !== null;
}

/**
 * Builds a proxy URL string containing credentials.
 * NEVER pass this to a logger or include it in error messages.
 */
export function buildProxyUrl(config: ProxyConfig): string {
  const auth = config.username
    ? `${encodeURIComponent(config.username)}${config.password ? `:${encodeURIComponent(config.password)}` : ''}@`
    : '';
  return `${config.protocol}://${auth}${config.host}:${config.port}`;
}

/** Returns the stored proxy settings for display (password masked). */
export async function getProxyConfigForDisplay(provider: ProviderId): Promise<ProxyDisplayConfig> {
  if (provider === ALICENET_PROVIDER_ID) {
    return {
      enabled: false,
      protocol: 'socks5h',
      host: '',
      port: null,
      username: '',
      hasPassword: false,
    };
  }
  const db = await readDbConfig(provider);
  return {
    enabled: db.enabled === true,
    protocol: VALID_PROTOCOLS.has(db.protocol ?? '')
      ? (db.protocol as ProxyProtocol)
      : 'socks5h',
    host: db.host ?? '',
    port: db.port ?? null,
    username: db.username ?? '',
    hasPassword: !!db.password,
  };
}

/**
 * Per-shop display variant — looks up `<providerId>_proxy_config` by string.
 * Used by the per-shop sections in Settings → Integrations so the user can
 * override the generic `stock_proxy_config` for one shop without affecting
 * the others.
 */
export async function getStockProviderProxyDisplay(providerId: StockProxyProviderId): Promise<ProxyDisplayConfig> {
  if (!/^[a-z][a-z0-9_]*$/.test(providerId)) {
    return {
      enabled: false,
      protocol: 'socks5h',
      host: '',
      port: null,
      username: '',
      hasPassword: false,
    };
  }
  const db = await readDbConfigByKey(`${providerId}_proxy_config`);
  return {
    enabled: db.enabled === true,
    protocol: VALID_PROTOCOLS.has(db.protocol ?? '')
      ? (db.protocol as ProxyProtocol)
      : 'socks5h',
    host: db.host ?? '',
    port: db.port ?? null,
    username: db.username ?? '',
    hasPassword: !!db.password,
  };
}

/** Private RFC-1918 / loopback pattern. */
const PRIVATE_HOST_RE =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|localhost$)/i;

interface ProxyPatchSuccess {
  next: StoredProxyConfig;
  error: null;
}

interface ProxyPatchFailure {
  next: null;
  error: string;
}

function applyProxyPatch(
  existing: StoredProxyConfig,
  patch: Record<string, unknown>,
): ProxyPatchSuccess | ProxyPatchFailure {
  const next: StoredProxyConfig = { ...existing };

  if ('enabled' in patch) {
    if (typeof patch.enabled !== 'boolean') return { next: null, error: 'enabled must be boolean' };
    next.enabled = patch.enabled;
  }

  if ('protocol' in patch) {
    if (typeof patch.protocol !== 'string') return { next: null, error: 'protocol must be a string' };
    if (!VALID_PROTOCOLS.has(patch.protocol))
      return { next: null, error: `protocol must be one of: ${[...VALID_PROTOCOLS].join(', ')}` };
    next.protocol = patch.protocol;
  }

  if ('host' in patch) {
    if (patch.host != null && typeof patch.host !== 'string') {
      return { next: null, error: 'host must be a string' };
    }
    if (typeof patch.host === 'string' && patch.host.length > 255) {
      return { next: null, error: 'host too long (max 255)' };
    }
    const h = (typeof patch.host === 'string' ? patch.host : '').trim();
    if (h) {
      if (!/^[a-zA-Z0-9]([a-zA-Z0-9.\-]*[a-zA-Z0-9])?$/.test(h))
        return { next: null, error: 'host must be a valid hostname' };
      if (PRIVATE_HOST_RE.test(h))
        return { next: null, error: 'host must not be a private or loopback address' };
    }
    next.host = h || undefined;
  }

  if ('port' in patch) {
    const raw = patch.port;
    if (raw == null || raw === '') {
      next.port = undefined;
    } else {
      const p = Number(raw);
      if (!Number.isInteger(p) || p < 1 || p > 65535)
        return { next: null, error: 'port must be an integer between 1 and 65535' };
      next.port = p;
    }
  }

  if ('username' in patch) {
    const u = patch.username;
    if (u != null && typeof u !== 'string') return { next: null, error: 'username must be a string' };
    if (typeof u === 'string' && u.length > 256) {
      return { next: null, error: 'username too long (max 256)' };
    }
    next.username = (typeof u === 'string' ? u : '').trim() || undefined;
  }

  if ('password' in patch) {
    const pw = patch.password;
    if (pw != null && typeof pw !== 'string') return { next: null, error: 'password must be a string' };
    if (typeof pw === 'string' && pw.length > 256) {
      return { next: null, error: 'password too long (max 256)' };
    }
    if (pw === null) {
      next.password = undefined;
    } else {
      const value = pw;
      if (value !== '' && value !== PROXY_PASSWORD_MASK) {
        next.password = value;
      }
    }
  }

  return { next, error: null };
}

/** Validated application-setting write prepared without mutating persistence. */
export interface PreparedProxyConfigUpdate {
  key: string;
  value: string;
}

/** Validate and serialize one fixed-provider proxy update. */
export async function prepareProxyConfigUpdate(
  provider: ProviderId,
  patch: Record<string, unknown>,
): Promise<{ update: PreparedProxyConfigUpdate | null; error: string | null }> {
  if (provider === ALICENET_PROVIDER_ID) {
    return { update: null, error: 'AliceNet proxy is configured through stock_proxy_config' };
  }
  const result = applyProxyPatch(await readDbConfig(provider), patch);
  if (result.error) return { update: null, error: result.error };
  return {
    update: { key: PROXY_DB_KEY[provider], value: JSON.stringify(result.next) },
    error: null,
  };
}

/** Validate and serialize one shop-specific proxy update. */
export async function prepareStockProviderProxyUpdate(
  providerId: StockProxyProviderId,
  patch: Record<string, unknown>,
): Promise<{ update: PreparedProxyConfigUpdate | null; error: string | null }> {
  if (!/^[a-z][a-z0-9_]*$/.test(providerId)) return { update: null, error: 'invalid provider id' };
  const key = `${providerId}_proxy_config`;
  const result = applyProxyPatch(await readDbConfigByKey(key), patch);
  if (result.error) return { update: null, error: result.error };
  return { update: { key, value: JSON.stringify(result.next) }, error: null };
}

/** Validate and persist proxy settings for a fixed provider. */
export async function saveProxyConfig(
  provider: ProviderId,
  patch: Record<string, unknown>,
): Promise<string | null> {
  const prepared = await prepareProxyConfigUpdate(provider, patch);
  if (!prepared.update) return prepared.error;
  await getAppSettingRepository().set(prepared.update.key, prepared.update.value);
  return null;
}

/** Validate and persist one shop-specific proxy update. */
export async function saveStockProviderProxyConfig(
  providerId: StockProxyProviderId,
  patch: Record<string, unknown>,
): Promise<string | null> {
  const prepared = await prepareStockProviderProxyUpdate(providerId, patch);
  if (!prepared.update) return prepared.error;
  await getAppSettingRepository().set(prepared.update.key, prepared.update.value);
  return null;
}
