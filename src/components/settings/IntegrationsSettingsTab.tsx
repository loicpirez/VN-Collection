'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Eye, EyeOff, KeyRound, Loader2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import {
  STOCK_PROVIDER_IDS,
  STOCK_PROVIDER_LABELS,
} from '@/lib/stock-provider-constants';
import type { SaveServer } from '../SettingsButton';
import type { ProxyDisplayConfig, ServerSettings, StockProviderProxyKey } from '@/lib/settings-server-client-shape';
import { readApiError } from '@/lib/api-error-read';
import { decodeProxyTestResult } from '@/lib/proxy-test-shape';

interface ProxySettingsSectionProps {
  t: ReturnType<typeof useT>;
  /** DB key - `<id>_proxy_config`. Used by the parent to wire onSave. */
  providerKey: string;
  /**
   * Provider id passed to `POST /api/proxy/test`. For fixed providers
   * (egs, vndb, vndbmirror, alicenet, stock) this is the
   * canonical id from `ProviderId`. For per-shop overrides this is the
   * shop's `StockProviderId` (sofmap, surugaya, amiami, …).
   */
  providerId: string;
  label: string;
  config: ProxyDisplayConfig | undefined;
  onSave: (patch: Record<string, unknown>) => void;
  /**
   * Compact mode renders without the section border + heading hierarchy,
   * suitable for nesting many shops inside a `<details>` accordion.
   */
  compact?: boolean;
}

function ProxySettingsSection({ t, providerKey, providerId, label, config, onSave, compact = false }: ProxySettingsSectionProps) {
  const [showPw, setShowPw] = useState(false);
  const [pwDraft, setPwDraft] = useState('');
  const [pwFocused, setPwFocused] = useState(false);
  const pwInputRef = useRef<HTMLInputElement | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; ms?: number; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const testAbortRef = useRef<AbortController | null>(null);
  const testInFlightRef = useRef(false);
  const protocolId = useId();
  const hostId = useId();
  const portId = useId();
  const usernameId = useId();
  const passwordId = useId();
  const testDisabledHintId = useId();

  useEffect(() => {
    testAbortRef.current?.abort();
    testAbortRef.current = null;
    testInFlightRef.current = false;
    setTesting(false);
    setTestResult(null);
    return () => {
      testAbortRef.current?.abort();
      testAbortRef.current = null;
      testInFlightRef.current = false;
    };
  }, [providerKey]);

  function handleTest() {
    if (testInFlightRef.current) return;
    testAbortRef.current?.abort();
    const controller = new AbortController();
    testAbortRef.current = controller;
    testInFlightRef.current = true;
    setTesting(true);
    setTestResult(null);
    void (async () => {
      try {
        const res = await fetch('/api/proxy/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: providerId }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(await readApiError(res, t.common.unknownError));
        const data = decodeProxyTestResult(await res.json());
        if (!data) throw new Error(t.common.unknownError);
        if (controller.signal.aborted || testAbortRef.current !== controller) return;
        setTestResult(data.ok
          ? { ok: true, ms: data.latencyMs }
          : { ok: false, error: data.error });
      } catch (e) {
        if (controller.signal.aborted || testAbortRef.current !== controller || (e instanceof Error && e.name === 'AbortError')) return;
        setTestResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
      } finally {
        if (testAbortRef.current !== controller) return;
        testAbortRef.current = null;
        testInFlightRef.current = false;
        setTesting(false);
      }
    })();
  }

  return (
    <section className={compact ? 'rounded border border-border bg-bg-elev/30 p-3' : 'border-t border-border pt-5'}>
      {compact ? (
        <h4 className="mb-2 text-[12px] font-bold">{label}</h4>
      ) : (
        <>
          <h3 className="mb-1 text-sm font-bold">
            {t.settings.proxyTitle} / {label}
          </h3>
          <p className="mb-3 text-[11px] text-muted">{t.settings.proxyDesc}</p>
        </>
      )}
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-[12px]">
          <input
            type="checkbox"
            checked={config?.enabled ?? false}
            onChange={(e) => onSave({ enabled: e.target.checked })}
            className="accent-accent"
          />
          {t.settings.proxyEnabled}
        </label>
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-[11px]">
          <label htmlFor={protocolId} className="font-semibold text-muted">{t.settings.proxyProtocol}</label>
          <select
            id={protocolId}
            value={config?.protocol ?? 'socks5h'}
            onChange={(e) => onSave({ protocol: e.target.value })}
            className="input text-[11px]"
          >
            {(['socks5h', 'socks5', 'http', 'https'] as const).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <label htmlFor={hostId} className="font-semibold text-muted">{t.settings.proxyHost}</label>
          <input
            id={hostId}
            type="text"
            defaultValue={config?.host ?? ''}
            placeholder={t.settings.proxyHostPlaceholder}
            onBlur={(e) => onSave({ host: e.target.value.trim() || null })}
            className="input text-[11px]"
          />
          <label htmlFor={portId} className="font-semibold text-muted">{t.settings.proxyPort}</label>
          <input
            id={portId}
            type="number"
            inputMode="numeric"
            min={1}
            max={65535}
            defaultValue={config?.port ?? ''}
            placeholder={t.settings.proxyPortPlaceholder}
            onBlur={(e) => {
              const v = e.target.value.trim();
              onSave({ port: v ? Number(v) : null });
            }}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            className="input no-spinner text-[11px]"
          />
          <label htmlFor={usernameId} className="font-semibold text-muted">{t.settings.proxyUsername}</label>
          <input
            id={usernameId}
            type="text"
            autoComplete="username"
            defaultValue={config?.username ?? ''}
            onBlur={(e) => onSave({ username: e.target.value.trim() || null })}
            className="input text-[11px]"
          />
          <label htmlFor={passwordId} className="font-semibold text-muted">{t.settings.proxyPassword}</label>
          {config?.hasPassword && !pwFocused && !pwDraft ? (
            // STORED STATE - render a real chip + Replace button
            // instead of relying on placeholder text. Previous design
            // showed `•••••••• déjà enregistré` *inside* the input as
            // a placeholder; users repeatedly mistook the dots for
            // the actual stored password and tried to "unhide" them
            // with the eye button. The server never echoes the
            // stored value back (`/api/settings` returns only
            // `{ hasPassword: true }`), so the right UI is to make
            // the stored state explicit (badge + Replace + Clear)
            // and the editable state a separate mode.
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-md border border-status-completed/40 bg-status-completed/10 px-2 py-1 text-[10px] font-semibold text-status-completed"
                aria-live="polite"
              >
                <Check className="h-3 w-3" aria-hidden />
                {t.settings.proxyPasswordStoredBadge}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPwFocused(true);
                  // setTimeout pushes focus to the next paint so the
                  // newly-mounted real input receives it.
                  setTimeout(() => pwInputRef.current?.focus(), 0);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[10px] text-muted hover:border-accent hover:text-accent"
              >
                <KeyRound className="h-3 w-3" aria-hidden />
                {t.settings.proxyPasswordReplace}
              </button>
              <button
                type="button"
                onClick={() => onSave({ password: null })}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[10px] text-muted hover:border-status-dropped hover:text-status-dropped"
              >
                <X className="h-3 w-3" aria-hidden />
                {t.settings.proxyPasswordClear}
              </button>
            </div>
          ) : (
            // EDIT STATE - normal password input + visibility toggle.
            <div className="flex items-center gap-1">
              <input
                id={passwordId}
                ref={pwInputRef}
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder={t.settings.proxyPasswordPlaceholder}
                value={pwDraft}
                onChange={(e) => setPwDraft(e.target.value)}
                onFocus={() => setPwFocused(true)}
                onBlur={(e) => {
                  setPwFocused(false);
                  if (e.target.value) onSave({ password: e.target.value });
                }}
                className="input flex-1 text-[11px]"
              />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setShowPw((v) => !v);
                  pwInputRef.current?.focus();
                }}
                className="rounded p-1 text-muted hover:text-fg"
                aria-label={showPw ? t.settings.proxyPasswordHide : t.settings.proxyPasswordShow}
                aria-pressed={showPw}
                title={showPw ? t.settings.proxyPasswordHide : t.settings.proxyPasswordShow}
              >
                {showPw ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={testing || !config?.enabled}
            onClick={handleTest}
            className="rounded-md border border-border px-2 py-1.5 text-[10px] text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            aria-describedby={!config?.enabled ? testDisabledHintId : undefined}
          >
            {testing ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : t.settings.proxyTestButton}
          </button>
          {!config?.enabled && (
            <span id={testDisabledHintId} className="sr-only">
              {t.settings.proxyTestDisabledHint}
            </span>
          )}
          {testResult && (
            <span
              role="status"
              aria-live="polite"
              className={`text-[10px] ${testResult.ok ? 'text-status-completed' : 'text-status-dropped'}`}
            >
              {testResult.ok
                ? t.settings.proxyTestOk.replace('{ms}', String(testResult.ms ?? 0))
                : t.settings.proxyTestFail.replace('{error}', testResult.error ?? '')}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function StockProviderToggles({
  t,
  disabledProviders,
  onSave,
}: {
  t: ReturnType<typeof useT>;
  disabledProviders: string[];
  onSave: (next: string[]) => void;
}) {
  const disabledSet = new Set(disabledProviders);

  function toggle(id: string) {
    const next = new Set(disabledSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSave([...next]);
  }

  return (
    <section className="border-t border-border pt-5">
      <details className="group">
        <summary className="cursor-pointer text-sm font-bold hover:text-accent">
          {t.settings.stockProvidersTitle}
          <ChevronDown className="inline-block h-3.5 w-3.5 align-baseline transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <p className="mb-3 mt-2 text-[11px] text-muted">{t.settings.stockProvidersDesc}</p>
        <div className="mb-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSave([])}
            className="rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[10px] text-muted hover:border-accent hover:text-accent"
          >
            {t.settings.stockProviderEnableAll}
          </button>
          <button
            type="button"
            onClick={() => onSave([...STOCK_PROVIDER_IDS])}
            className="rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[10px] text-muted hover:border-status-dropped hover:text-status-dropped"
          >
            {t.settings.stockProviderDisableAll}
          </button>
        </div>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {STOCK_PROVIDER_IDS.map((id) => {
            const enabled = !disabledSet.has(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  onClick={() => toggle(id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[11px] transition-colors ${
                    enabled
                      ? 'border-accent/40 bg-accent/5 text-white'
                      : 'border-border bg-bg-elev/30 text-muted'
                  }`}
                >
                  <span className="truncate font-medium">{STOCK_PROVIDER_LABELS[id]}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      enabled
                        ? 'bg-accent/20 text-accent'
                        : 'bg-bg-elev text-muted'
                    }`}
                  >
                    {enabled ? t.settings.stockProviderEnabled : t.settings.stockProviderDisabled}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

/**
 * Body of the Settings → Integrations tab (Steam / EGS credentials,
 * per-provider proxy config, stock-provider toggles, random-quote
 * source). Loaded via `next/dynamic` from `SettingsButton` so its JSX
 * does not ship until the user opens this tab.
 */
export function IntegrationsSettingsTab({
  server,
  saveServer,
}: {
  server: ServerSettings | null;
  saveServer: SaveServer;
}) {
  const t = useT();
  return (
    <div
      role="tabpanel"
      id="settings-panel-integrations"
      aria-labelledby="settings-tab-integrations"
      className="space-y-6"
    >
      <section>
        <h3 className="mb-1 text-sm font-bold">{t.settings.steamTitle}</h3>
        <p className="mb-3 text-[11px] text-muted">{t.settings.steamDesc}</p>
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted">
              <span>{t.settings.steamApiKeyLabel}</span>
              {server?.steam_api_key?.hasKey && (
                <span className="inline-flex items-center gap-1 rounded-full border border-status-completed/40 bg-status-completed/10 px-2 py-0.5 text-[10px] font-bold text-status-completed">
                  <Check className="h-2.5 w-2.5" aria-hidden />
                  {t.settings.credentialSaved}
                </span>
              )}
              {server?.steam_api_key?.hasKey && (
                <button
                  type="button"
                  onClick={() => saveServer({ steam_api_key: null })}
                  className="text-[10px] text-muted underline-offset-2 hover:text-status-dropped hover:underline"
                  title={t.settings.credentialClear}
                >
                  {t.settings.credentialClear}
                </button>
              )}
            </span>
            <input
              type="password"
              autoComplete="off"
              // We never display the raw key. The masked
              // "saved" badge above the input tells the
              // user a key is stored. The input itself
              // stays empty so they can replace it.
              defaultValue=""
              placeholder={server?.steam_api_key?.hasKey ? t.settings.credentialStoredPlaceholder : t.settings.steamKeyPlaceholder}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v) saveServer({ steam_api_key: v });
              }}
              aria-label={t.settings.steamApiKeyLabel}
              className="input w-full"
            />
            <span className="text-[10px] text-muted">{t.settings.steamApiKeyHint}</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-muted">{t.settings.steamIdLabel}</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              defaultValue={server?.steam_id ?? ''}
              placeholder={t.settings.steamIdPlaceholder}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (server?.steam_id ?? '')) saveServer({ steam_id: v || null });
              }}
              aria-label={t.settings.steamIdLabel}
              className="input w-full"
            />
            <span className="text-[10px] text-muted">{t.settings.steamIdHint}</span>
          </label>
        </div>
      </section>

      <section className="border-t border-border pt-5">
        <h3 className="mb-1 text-sm font-bold">{t.settings.egsTitle}</h3>
        <p className="mb-3 text-[11px] text-muted">{t.settings.egsDesc}</p>
        <label className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted">
            <span>{t.settings.egsUsernameLabel}</span>
            {server?.egs_username && (
              <span className="inline-flex items-center gap-1 rounded-full border border-status-completed/40 bg-status-completed/10 px-2 py-0.5 text-[10px] font-bold text-status-completed">
                <Check className="h-2.5 w-2.5" aria-hidden />
                {server.egs_username}
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              autoComplete="username"
              inputMode="text"
              pattern="[A-Za-z0-9_]{1,32}"
              defaultValue={server?.egs_username ?? ''}
              placeholder={t.settings.egsUsernamePlaceholder}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (server?.egs_username ?? '')) saveServer({ egs_username: v || null });
              }}
              aria-label={t.settings.egsUsernameLabel}
              className="input flex-1"
            />
            {server?.egs_username && (
              <button
                type="button"
                onClick={() => saveServer({ egs_username: null })}
                className="rounded-md border border-border px-2 py-1.5 text-[10px] text-muted hover:border-status-dropped hover:text-status-dropped"
                title={t.settings.egsUsernameReset}
              >
                {t.settings.egsUsernameReset}
              </button>
            )}
          </div>
          <span className="text-[10px] text-muted">{t.settings.egsUsernameHint}</span>
        </label>
      </section>

      <ProxySettingsSection
        t={t}
        providerKey="egs_proxy_config"
        providerId="egs"
        label={t.settings.proxyProviderEgs}
        config={server?.egs_proxy_config}
        onSave={(patch) => saveServer({ egs_proxy_config: patch })}
      />
      <ProxySettingsSection
        t={t}
        providerKey="vndb_proxy_config"
        providerId="vndb"
        label={t.settings.proxyProviderVndb}
        config={server?.vndb_proxy_config}
        onSave={(patch) => saveServer({ vndb_proxy_config: patch })}
      />
      <ProxySettingsSection
        t={t}
        providerKey="vndbmirror_proxy_config"
        providerId="vndbmirror"
        label={t.settings.proxyProviderVndbmirror}
        config={server?.vndbmirror_proxy_config}
        onSave={(patch) => saveServer({ vndbmirror_proxy_config: patch })}
      />
      <ProxySettingsSection
        t={t}
        providerKey="alicenet_proxy_config"
        providerId="alicenet"
        label={t.settings.proxyProviderAliceNet}
        config={server?.alicenet_proxy_config}
        onSave={(patch) => saveServer({ alicenet_proxy_config: patch })}
      />
      <ProxySettingsSection
        t={t}
        providerKey="stock_proxy_config"
        providerId="stock"
        label={t.settings.proxyProviderStock}
        config={server?.stock_proxy_config}
        onSave={(patch) => saveServer({ stock_proxy_config: patch })}
      />

      <StockProviderToggles
        t={t}
        disabledProviders={server?.stock_disabled_providers ?? []}
        onSave={(next) => saveServer({ stock_disabled_providers: next.length > 0 ? next : null })}
      />

      <label className="flex items-start gap-2 rounded-md border border-border bg-bg-elev/30 p-3 text-xs">
        <input
          type="checkbox"
          checked={!!server?.stock_retry_without_proxy}
          onChange={(e) => saveServer({ stock_retry_without_proxy: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-accent"
        />
        <span>
          <span className="font-bold">{t.settings.stockRetryDirectTitle}</span>
          <span className="block text-[10px] text-muted">{t.settings.stockRetryDirectDesc}</span>
        </span>
      </label>

      <section className="border-t border-border pt-5">
        <details className="group">
          <summary className="cursor-pointer text-sm font-bold hover:text-accent">
            {t.settings.proxyShopOverridesTitle}
            <ChevronDown className="inline-block h-3.5 w-3.5 align-baseline transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <p className="mb-3 mt-2 text-[11px] text-muted">{t.settings.proxyShopOverridesDesc}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {STOCK_PROVIDER_IDS.map((id) => {
              const dbKey: StockProviderProxyKey = `${id}_proxy_config`;
              const cfg = server?.[dbKey];
              return (
                <ProxySettingsSection
                  key={id}
                  t={t}
                  providerKey={dbKey}
                  providerId={id}
                  label={STOCK_PROVIDER_LABELS[id]}
                  config={cfg}
                  onSave={(patch) => saveServer({ [dbKey]: patch })}
                  compact
                />
              );
            })}
          </div>
        </details>
      </section>

      <section className="border-t border-border pt-5">
        <h3 className="mb-1 text-sm font-bold">{t.settings.randomQuoteTitle}</h3>
        <p className="mb-3 text-[11px] text-muted">{t.settings.randomQuoteDesc}</p>
        <div className="inline-flex rounded-md border border-border bg-bg-elev/30 p-0.5 text-[11px]">
          {(['all', 'mine'] as const).map((opt) => {
            const active = server?.random_quote_source === opt || (!server && opt === 'all');
            return (
              <button
                key={opt}
                type="button"
                onClick={() => saveServer({ random_quote_source: opt })}
                className={`rounded px-2 py-1 transition-colors ${
                  active ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'
                }`}
              >
                {opt === 'all' ? t.settings.randomQuoteAll : t.settings.randomQuoteMine}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
