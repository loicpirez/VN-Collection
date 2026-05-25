import 'server-only';
import { getAppSetting, setAppSetting } from './db';

export type ProxyProtocol = 'http' | 'https' | 'socks5' | 'socks5h';
export type ProviderId = 'vndb' | 'vndbmirror' | 'egs';

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
};

export const PROXY_DB_KEY: Record<ProviderId, string> = {
  vndb: 'vndb_proxy_config',
  vndbmirror: 'vndbmirror_proxy_config',
  egs: 'egs_proxy_config',
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

function readDbConfig(provider: ProviderId): StoredProxyConfig {
  const raw = getAppSetting(PROXY_DB_KEY[provider]);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as StoredProxyConfig;
  } catch {
    return {};
  }
}

/**
 * Resolves the active proxy configuration for a provider.
 * Env vars take priority over DB settings. Returns null when disabled or incomplete.
 * Never logs the returned config — it contains credentials.
 */
export function resolveProxyConfig(provider: ProviderId): ProxyConfig | null {
  const ep = ENV_PREFIX[provider];
  const db = readDbConfig(provider);

  const enabledEnv = process.env[`${ep}_PROXY_ENABLED`];
  const enabled =
    enabledEnv != null
      ? enabledEnv === 'true' || enabledEnv === '1'
      : db.enabled === true;
  if (!enabled) return null;

  const host = process.env[`${ep}_PROXY_HOST`] ?? db.host ?? '';
  if (!host) return null;

  const portStr = process.env[`${ep}_PROXY_PORT`] ?? String(db.port ?? '');
  const port = parseInt(portStr, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  const rawProtocol =
    process.env[`${ep}_PROXY_PROTOCOL`] ?? db.protocol ?? 'socks5h';
  if (!VALID_PROTOCOLS.has(rawProtocol)) return null;

  const username = process.env[`${ep}_PROXY_USERNAME`] ?? db.username ?? null;
  const password = process.env[`${ep}_PROXY_PASSWORD`] ?? db.password ?? null;

  return {
    protocol: rawProtocol as ProxyProtocol,
    host,
    port,
    username: username || null,
    password: password || null,
  };
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
    if (!VALID_PROTOCOLS.has(patch.protocol as string))
      return `protocol must be one of: ${[...VALID_PROTOCOLS].join(', ')}`;
    next.protocol = patch.protocol as string;
  }

  if ('host' in patch) {
    const h = ((patch.host as string) ?? '').trim();
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
    next.username = ((patch.username as string) ?? '').trim() || undefined;
  }

  if ('password' in patch) {
    const pw = (patch.password as string) ?? '';
    if (pw !== '' && pw !== PROXY_PASSWORD_MASK) {
      next.password = pw;
    }
  }

  setAppSetting(PROXY_DB_KEY[provider], JSON.stringify(next));
  return null;
}
