import 'server-only';
import { getAppSetting, setAppSetting } from './db';

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

const ENV_PREFIX: Record<ProviderId, string> = {
  vndb: 'VNDB',
  vndbmirror: 'VNDBMIRROR',
  egs: 'EGS',
  alicenet: 'ALICENET',
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

function readDbConfig(provider: ProviderId): StoredProxyConfig {
  const raw = getAppSetting(PROXY_DB_KEY[provider]);
  if (!raw) return {};
  try {
    return sanitizeStoredProxyConfig(JSON.parse(raw));
  } catch {
    return {};
  }
}

function readDbConfigByKey(key: string): StoredProxyConfig {
  const raw = getAppSetting(key);
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
  const port = parseInt(portStr, 10);
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
 * Env vars take priority over DB settings. Returns null when disabled or incomplete.
 * Never logs the returned config — it contains credentials.
 */
export function resolveProxyConfig(provider: ProviderId): ProxyConfig | null {
  return resolveFromStored(ENV_PREFIX[provider], readDbConfig(provider));
}

/**
 * Two-tier proxy resolution for stock providers:
 *   1. Per-shop override at `<providerId>_proxy_config` (env prefix
 *      `<PROVIDERID>_PROXY_*`), if enabled.
 *   2. Generic `stock_proxy_config` (env prefix `STOCK_PROXY_*`), if enabled.
 *   3. null — direct connection.
 *
 * The two-tier system lets the operator route ONE bot-blocked shop
 * (AmiAmi, Suruga-ya, GEO) through a separate proxy without having to
 * funnel every other shop through it.
 */
export function resolveStockProviderProxy(providerId: StockProxyProviderId): ProxyConfig | null {
  // Sanity-check the provider id so we never look up arbitrary keys.
  if (!/^[a-z][a-z0-9_]*$/.test(providerId)) return resolveProxyConfig('stock');
  const envPrefix = providerId.toUpperCase();
  const dbKey = `${providerId}_proxy_config`;
  const perShop = resolveFromStored(envPrefix, readDbConfigByKey(dbKey));
  if (perShop) return perShop;
  return resolveProxyConfig('stock');
}

/**
 * True when a proxy (per-shop override or the generic `stock` proxy) is
 * active for this provider. Lets the stock refresh decide whether a
 * direct-connection retry is meaningful without exposing credentials.
 */
export function isStockProviderProxied(providerId: StockProxyProviderId): boolean {
  return resolveStockProviderProxy(providerId) !== null;
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
export function getProxyConfigForDisplay(provider: ProviderId): ProxyDisplayConfig {
  const db = readDbConfig(provider);
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
export function getStockProviderProxyDisplay(providerId: StockProxyProviderId): ProxyDisplayConfig {
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
  const db = readDbConfigByKey(`${providerId}_proxy_config`);
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

/**
 * Validates and persists proxy settings for a provider.
 * Preserves the stored password when the submitted value is empty or the mask sentinel.
 * Returns an error string on validation failure, null on success.
 */
export function saveProxyConfig(
  provider: ProviderId,
  patch: Record<string, unknown>,
): string | null {
  const existing = readDbConfig(provider);
  const next: StoredProxyConfig = { ...existing };

  if ('enabled' in patch) {
    if (typeof patch.enabled !== 'boolean') return 'enabled must be boolean';
    next.enabled = patch.enabled;
  }

  if ('protocol' in patch) {
    if (typeof patch.protocol !== 'string') return 'protocol must be a string';
    if (!VALID_PROTOCOLS.has(patch.protocol))
      return `protocol must be one of: ${[...VALID_PROTOCOLS].join(', ')}`;
    next.protocol = patch.protocol;
  }

  if ('host' in patch) {
    if (patch.host != null && typeof patch.host !== 'string') return 'host must be a string';
    if (typeof patch.host === 'string' && patch.host.length > 255) return 'host too long (max 255)';
    const h = (typeof patch.host === 'string' ? patch.host : '').trim();
    if (h) {
      if (!/^[a-zA-Z0-9]([a-zA-Z0-9.\-]*[a-zA-Z0-9])?$/.test(h))
        return 'host must be a valid hostname';
      if (PRIVATE_HOST_RE.test(h))
        return 'host must not be a private or loopback address';
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
        return 'port must be an integer between 1 and 65535';
      next.port = p;
    }
  }

  if ('username' in patch) {
    const u = patch.username;
    if (u != null && typeof u !== 'string') return 'username must be a string';
    if (typeof u === 'string' && u.length > 256) return 'username too long (max 256)';
    next.username = (typeof u === 'string' ? u : '').trim() || undefined;
  }

  if ('password' in patch) {
    const pw = patch.password;
    if (pw != null && typeof pw !== 'string') return 'password must be a string';
    if (typeof pw === 'string' && pw.length > 256) return 'password too long (max 256)';
    // Three intents resolve cleanly:
    // 1. `pw === null` → explicit clear (the "Clear" button in
    //    the Integrations UI). Drop the stored password.
    // 2. `pw === ''` or `pw === PROXY_PASSWORD_MASK` → no-op
    //    (the form blurred with no real edit, or echoed the
    //    masked value back).
    // 3. anything else → save as new password.
    if (pw === null) {
      next.password = undefined;
    } else {
      const value = typeof pw === 'string' ? pw : '';
      if (value !== '' && value !== PROXY_PASSWORD_MASK) {
        next.password = value;
      }
    }
  }

  setAppSetting(PROXY_DB_KEY[provider], JSON.stringify(next));
  return null;
}

/**
 * Per-shop write variant — persists to `<providerId>_proxy_config`.
 * Mirrors `saveProxyConfig` validation but keys off the free-form shop id.
 */
export function saveStockProviderProxyConfig(
  providerId: StockProxyProviderId,
  patch: Record<string, unknown>,
): string | null {
  if (!/^[a-z][a-z0-9_]*$/.test(providerId)) return 'invalid provider id';
  const dbKey = `${providerId}_proxy_config`;
  const existing = readDbConfigByKey(dbKey);
  const next: StoredProxyConfig = { ...existing };

  if ('enabled' in patch) {
    if (typeof patch.enabled !== 'boolean') return 'enabled must be boolean';
    next.enabled = patch.enabled;
  }

  if ('protocol' in patch) {
    if (typeof patch.protocol !== 'string') return 'protocol must be a string';
    if (!VALID_PROTOCOLS.has(patch.protocol))
      return `protocol must be one of: ${[...VALID_PROTOCOLS].join(', ')}`;
    next.protocol = patch.protocol;
  }

  if ('host' in patch) {
    if (patch.host != null && typeof patch.host !== 'string') return 'host must be a string';
    if (typeof patch.host === 'string' && patch.host.length > 255) return 'host too long (max 255)';
    const h = (typeof patch.host === 'string' ? patch.host : '').trim();
    if (h) {
      if (!/^[a-zA-Z0-9]([a-zA-Z0-9.\-]*[a-zA-Z0-9])?$/.test(h))
        return 'host must be a valid hostname';
      if (PRIVATE_HOST_RE.test(h))
        return 'host must not be a private or loopback address';
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
        return 'port must be an integer between 1 and 65535';
      next.port = p;
    }
  }

  if ('username' in patch) {
    const u = patch.username;
    if (u != null && typeof u !== 'string') return 'username must be a string';
    if (typeof u === 'string' && u.length > 256) return 'username too long (max 256)';
    next.username = (typeof u === 'string' ? u : '').trim() || undefined;
  }

  if ('password' in patch) {
    const pw = patch.password;
    if (pw != null && typeof pw !== 'string') return 'password must be a string';
    if (typeof pw === 'string' && pw.length > 256) return 'password too long (max 256)';
    // `pw === null` → explicit clear (Clear button). Empty string
    // / mask = no-op (form blur or echo). Anything else = new
    // password.
    if (pw === null) {
      next.password = undefined;
    } else {
      const value = typeof pw === 'string' ? pw : '';
      if (value !== '' && value !== PROXY_PASSWORD_MASK) {
        next.password = value;
      }
    }
  }

  setAppSetting(dbKey, JSON.stringify(next));
  return null;
}
