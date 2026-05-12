'use client';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, Loader2, Save, Settings2, X } from 'lucide-react';
import { useDisplaySettings } from '@/lib/settings/client';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';

type SortKey =
  | 'updated_at'
  | 'added_at'
  | 'title'
  | 'rating'
  | 'user_rating'
  | 'playtime'
  | 'released'
  | 'producer'
  | 'egs_rating'
  | 'combined_rating'
  | 'custom';

const SORT_KEYS: SortKey[] = [
  'updated_at',
  'added_at',
  'title',
  'rating',
  'user_rating',
  'playtime',
  'released',
  'producer',
  'egs_rating',
  'combined_rating',
  'custom',
];

interface ServerSettings {
  vndb_token: { hasToken: boolean; preview: string | null; envFallback: boolean };
  random_quote_source: 'all' | 'mine';
  default_sort: SortKey;
  vndb_writeback?: boolean;
  steam_api_key?: { hasKey: boolean; preview: string | null };
  steam_id?: string;
}

export function SettingsButton() {
  const t = useT();
  const toast = useToast();
  const { settings, set, reset } = useDisplaySettings();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [server, setServer] = useState<ServerSettings | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);

  const loadServer = useCallback(async () => {
    try {
      const r = await fetch('/api/settings', { cache: 'no-store' });
      if (!r.ok) return;
      setServer((await r.json()) as ServerSettings);
    } catch {
      // ignore — modal still works for client-side prefs
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadServer();
      setTokenInput('');
    }
  }, [open, loadServer]);

  async function saveServer(
    patch: Partial<{
      vndb_token: string | null;
      random_quote_source: 'all' | 'mine';
      default_sort: SortKey;
      vndb_writeback: boolean;
      steam_api_key: string | null;
      steam_id: string | null;
    }>,
  ) {
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.saved);
      await loadServer();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onSaveToken() {
    setSavingToken(true);
    await saveServer({ vndb_token: tokenInput.trim() || null });
    setSavingToken(false);
    setTokenInput('');
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg-card text-muted hover:text-white"
        onClick={() => setOpen(true)}
        aria-label={t.settings.title}
        title={t.settings.title}
      >
        <Settings2 className="h-4 w-4" />
      </button>

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/70 p-6 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-label={t.settings.title}
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div className="relative mt-12 w-full max-w-3xl rounded-2xl border border-border bg-bg-card p-6 shadow-card">
                <button
                  type="button"
                  className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-bg-elev hover:text-white"
                  onClick={() => setOpen(false)}
                  aria-label={t.common.close}
                >
                  <X className="h-4 w-4" />
                </button>
                <h2 className="mb-1 text-lg font-bold">{t.settings.title}</h2>
                <p className="mb-5 text-xs text-muted">{t.settings.subtitle}</p>

                <div className="grid gap-4 md:grid-cols-2">
                  <Toggle
                    label={t.settings.hideImages}
                    description={t.settings.hideImagesDesc}
                    value={settings.hideImages}
                    onChange={(v) => set('hideImages', v)}
                  />
                  <Toggle
                    label={t.settings.blurR18}
                    description={t.settings.blurR18Desc}
                    value={settings.blurR18}
                    onChange={(v) => set('blurR18', v)}
                  />
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-semibold">{t.settings.nsfwThreshold}</span>
                    <span className="text-[11px] text-muted">{t.settings.nsfwThresholdDesc}</span>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.1}
                      value={settings.nsfwThreshold}
                      onChange={(e) => set('nsfwThreshold', Number(e.target.value))}
                      className="accent-accent"
                    />
                    <span className="text-xs text-muted">{settings.nsfwThreshold.toFixed(1)} / 2.0</span>
                  </label>
                  <Toggle
                    label={t.settings.preferLocal}
                    description={t.settings.preferLocalDesc}
                    value={settings.preferLocalImages}
                    onChange={(v) => set('preferLocalImages', v)}
                  />
                  <Toggle
                    label={t.settings.preferNativeTitle}
                    description={t.settings.preferNativeTitleDesc}
                    value={settings.preferNativeTitle}
                    onChange={(v) => set('preferNativeTitle', v)}
                  />
                  <Toggle
                    label={t.settings.hideSexual}
                    description={t.settings.hideSexualDesc}
                    value={settings.hideSexual}
                    onChange={(v) => set('hideSexual', v)}
                  />
                </div>

                <div className="mt-6 border-t border-border pt-5">
                  <h3 className="mb-1 inline-flex items-center gap-2 text-sm font-bold">
                    <KeyRound className="h-4 w-4 text-accent" aria-hidden />
                    {t.settings.vndbTokenTitle}
                  </h3>
                  <p className="mb-3 text-[11px] text-muted">{t.settings.vndbTokenDesc}</p>
                  {server?.vndb_token.hasToken && server.vndb_token.preview && (
                    <p className="mb-2 text-[11px] text-muted">
                      {t.settings.vndbTokenCurrent}: <span className="font-mono text-accent">{server.vndb_token.preview}</span>
                    </p>
                  )}
                  {server?.vndb_token.hasToken && !server.vndb_token.preview && server.vndb_token.envFallback && (
                    <p className="mb-2 text-[11px] text-muted">{t.settings.vndbTokenEnv}</p>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="password"
                      className="input flex-1"
                      placeholder="vndb-..."
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={onSaveToken}
                      disabled={savingToken || !tokenInput.trim()}
                    >
                      {savingToken ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {t.common.save}
                    </button>
                  </div>
                  {server?.vndb_token.hasToken && (
                    <button
                      type="button"
                      className="mt-2 text-[11px] text-muted hover:text-status-dropped"
                      onClick={() => saveServer({ vndb_token: null })}
                    >
                      {t.settings.vndbTokenClear}
                    </button>
                  )}

                  {server?.vndb_token.hasToken && (
                    <label className="mt-4 flex items-start gap-2 rounded-md border border-border bg-bg-elev/30 p-3 text-xs">
                      <input
                        type="checkbox"
                        checked={!!server.vndb_writeback}
                        onChange={(e) => saveServer({ vndb_writeback: e.target.checked })}
                        className="mt-0.5 h-4 w-4 accent-accent"
                      />
                      <span>
                        <span className="font-bold">{t.settings.vndbWriteback}</span>
                        <span className="block text-[10px] text-muted">{t.settings.vndbWritebackDesc}</span>
                      </span>
                    </label>
                  )}
                </div>

                <div className="mt-6 border-t border-border pt-5">
                  <h3 className="mb-1 text-sm font-bold">{t.settings.steamTitle}</h3>
                  <p className="mb-3 text-[11px] text-muted">{t.settings.steamDesc}</p>
                  <div className="space-y-2">
                    <input
                      type="text"
                      defaultValue={server?.steam_api_key?.preview ?? ''}
                      placeholder={server?.steam_api_key?.hasKey ? server.steam_api_key.preview ?? '' : t.settings.steamKeyPlaceholder}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        // Don't save if user didn't change it (placeholder is mask)
                        if (v && !v.startsWith('…')) saveServer({ steam_api_key: v });
                      }}
                      className="input w-full"
                    />
                    <input
                      type="text"
                      defaultValue={server?.steam_id ?? ''}
                      placeholder={t.settings.steamIdPlaceholder}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (server?.steam_id ?? '')) saveServer({ steam_id: v || null });
                      }}
                      className="input w-full"
                    />
                  </div>
                </div>

                <div className="mt-6 border-t border-border pt-5">
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
                </div>

                <div className="mt-6 border-t border-border pt-5">
                  <h3 className="mb-1 text-sm font-bold">{t.settings.defaultSortTitle}</h3>
                  <p className="mb-3 text-[11px] text-muted">{t.settings.defaultSortDesc}</p>
                  <select
                    className="input w-full"
                    value={server?.default_sort ?? 'updated_at'}
                    onChange={(e) => saveServer({ default_sort: e.target.value as SortKey })}
                  >
                    {SORT_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {t.library.sort[k]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-6 flex justify-between">
                  <button type="button" className="btn" onClick={reset}>
                    {t.settings.reset}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
                    {t.common.close}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border bg-bg-elev/50 p-3 hover:border-accent">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-[11px] text-muted">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${value ? 'bg-accent' : 'bg-bg-elev'}`}
      >
        <span
          className={`absolute top-0.5 left-0 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            value ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}
