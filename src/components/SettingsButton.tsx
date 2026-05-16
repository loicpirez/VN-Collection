'use client';
import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useDialogA11y } from './Dialog';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, Download, Eye, EyeOff, KeyRound, Loader2, Save, Settings2, X } from 'lucide-react';
import { useDisplaySettings } from '@/lib/settings/client';
import { CardDensitySlider } from './CardDensitySlider';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import {
  DEFAULT_HOME_LAYOUT,
  HOME_LAYOUT_EVENT,
  HOME_SECTION_IDS,
  type HomeSectionId,
  type HomeSectionLayoutV1,
  type HomeSectionState,
} from '@/lib/home-section-layout';
import {
  VN_LAYOUT_EVENT,
  VN_SECTION_IDS,
  defaultVnDetailLayoutV1,
  type VnDetailLayoutV1,
  type VnSectionId,
  type VnSectionState,
} from '@/lib/vn-detail-layout';

type SortKey =
  | 'updated_at'
  | 'added_at'
  | 'title'
  | 'rating'
  | 'user_rating'
  | 'playtime'
  | 'length_minutes'
  | 'egs_playtime'
  | 'combined_playtime'
  | 'released'
  | 'producer'
  | 'publisher'
  | 'egs_rating'
  | 'combined_rating'
  | 'custom';

// Mirrors LibraryClient.tsx SORT_KEYS — keep these aligned with the
// route's VALID_SORTS too. Previously `publisher` was missing from this
// list (only) so the Settings dropdown silently dropped the option.
const SORT_KEYS: SortKey[] = [
  'updated_at',
  'added_at',
  'title',
  'rating',
  'user_rating',
  'playtime',
  'length_minutes',
  'egs_playtime',
  'combined_playtime',
  'released',
  'producer',
  'publisher',
  'egs_rating',
  'combined_rating',
  'custom',
];

type GroupKey = 'none' | 'status' | 'producer' | 'publisher' | 'tag' | 'series' | 'aspect';
const GROUP_KEYS: GroupKey[] = ['none', 'status', 'producer', 'publisher', 'tag', 'series', 'aspect'];

interface ServerSettings {
  vndb_token: { hasToken: boolean; preview: string | null; envFallback: boolean };
  random_quote_source: 'all' | 'mine';
  default_sort: SortKey;
  default_order?: 'asc' | 'desc';
  default_group?: GroupKey;
  home_section_layout_v1?: HomeSectionLayoutV1;
  vn_detail_section_layout_v1?: VnDetailLayoutV1;
  vndb_writeback?: boolean;
  vndb_backup_enabled?: boolean;
  vndb_backup_url?: { hasUrl: boolean; host: string | null; isDefault: boolean };
  vndb_fanout?: boolean;
  steam_api_key?: { hasKey: boolean; preview: string | null };
  steam_id?: string;
  egs_username?: string;
}

const SETTINGS_TABS = [
  'display',
  'content',
  'library',
  'home',
  'vn-page',
  'account',
  'integrations',
  'automation',
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

export function SettingsButton() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { settings, set, reset } = useDisplaySettings();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  useDialogA11y({ open, onClose: () => setOpen(false), panelRef });
  const [server, setServer] = useState<ServerSettings | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  // Active tab inside the modal. We deliberately don't persist this to
  // URL or storage — the user almost always re-enters the modal via
  // the gear icon (or "All settings…" from the spoiler popover) on a
  // specific concern and the freshest landing is Display.
  const [activeTab, setActiveTab] = useState<SettingsTab>('display');

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
      default_order: 'asc' | 'desc';
      default_group: GroupKey;
      home_section_layout_v1: { sections?: Partial<HomeSectionLayoutV1['sections']>; order?: HomeSectionLayoutV1['order'] } | null;
      vn_detail_section_layout_v1: VnDetailLayoutV1 | null;
      vndb_writeback: boolean;
      vndb_backup_enabled: boolean;
      vndb_backup_url: string | null;
      vndb_fanout: boolean;
      steam_api_key: string | null;
      steam_id: string | null;
      // /api/settings accepts this too; aligning the client type with
      // the route's surface so future EGS-username UI can call save
      // without a fresh widen.
      egs_username: string | null;
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

  const [pulling, setPulling] = useState(false);
  interface PullDiff {
    scanned: number;
    updated: number;
    unchanged: number;
    skippedNotInCollection: number;
    changes: { vn_id: string; title: string; from: string | null; to: string }[];
    unmatched: { vn_id: string; status: string }[];
  }
  const [pullDiff, setPullDiff] = useState<PullDiff | null>(null);
  async function onPullStatuses() {
    setPulling(true);
    try {
      const r = await fetch('/api/vndb/pull-statuses', { method: 'POST' });
      const data = (await r.json().catch(() => ({}))) as PullDiff & {
        ok?: boolean;
        needsAuth?: boolean;
        message?: string;
      };
      if (!r.ok || !data.ok) {
        throw new Error(data.message ?? t.common.error);
      }
      toast.success(`${t.settings.vndbPullDone} (${data.updated ?? 0}/${data.scanned ?? 0})`);
      setPullDiff({
        scanned: data.scanned,
        updated: data.updated,
        unchanged: data.unchanged,
        skippedNotInCollection: data.skippedNotInCollection,
        changes: data.changes ?? [],
        unmatched: data.unmatched ?? [],
      });
      // Updated statuses changed local DB state — reload the surrounding
      // server component so card status badges reflect the new values.
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPulling(false);
    }
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  // External "open me" trigger (dispatched by SpoilerToggle's
  // "Open full settings" button and by /data's "Manage in
  // Settings → Integrations" callout buttons).
  // Optional `event.detail.tab` selects a specific tab on open
  // so the callout from /data lands directly on `integrations`.
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ tab?: SettingsTab }>).detail;
      if (detail?.tab && (SETTINGS_TABS as readonly string[]).includes(detail.tab)) {
        setActiveTab(detail.tab);
      }
      setOpen(true);
    }
    window.addEventListener('vn:open-settings', onOpen);
    return () => window.removeEventListener('vn:open-settings', onOpen);
  }, []);

  // ESC handling, body-scroll lock, and focus trap are owned by
  // `useDialogA11y` above; the duplicate handler that used to live
  // here ran a second ESC listener and a second `body.overflow`
  // toggle whose teardown could undo the trap's own restoration.

  return (
    <>
      <button
        type="button"
        className="tap-target inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-bg-card text-muted hover:text-white"
        onClick={() => setOpen(true)}
        aria-label={t.settings.title}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t.settings.title}
      >
        <Settings2 className="h-4 w-4" aria-hidden />
      </button>

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/70 p-2 backdrop-blur-sm sm:p-6"
              onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="relative mt-6 w-full max-w-3xl rounded-2xl border border-border bg-bg-card p-4 shadow-card outline-none sm:mt-12 sm:p-6"
              >
                <button
                  type="button"
                  className="tap-target absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-bg-elev hover:text-white"
                  onClick={() => setOpen(false)}
                  aria-label={t.common.close}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
                <h2 id={titleId} className="mb-1 text-lg font-bold">{t.settings.title}</h2>
                <p className="mb-4 text-xs text-muted">{t.settings.subtitle}</p>

                {/*
                  Tab strip — replaces the previous long scroll of
                  "section / divider / section". Tabs group settings
                  by concern (Display / Content / Library / Home /
                  VN page / Account / Integrations / Automation). The
                  active tab gets the accent background and
                  aria-selected so screen readers track the change.
                */}
                <nav
                  role="tablist"
                  aria-label={t.settings.tabsLabel}
                  className="mb-5 flex flex-wrap gap-1 rounded-lg border border-border bg-bg-elev/30 p-1"
                >
                  {SETTINGS_TABS.map((tab) => {
                    const active = activeTab === tab;
                    return (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setActiveTab(tab)}
                        className={`tap-target-tight inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                          active
                            ? 'bg-accent text-bg'
                            : 'text-muted hover:text-white'
                        }`}
                      >
                        {t.settings.tabs[tab]}
                      </button>
                    );
                  })}
                </nav>

                {activeTab === 'display' && (
                  <div className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Toggle
                        label={t.settings.hideImages}
                        description={t.settings.hideImagesDesc}
                        value={settings.hideImages}
                        onChange={(v) => set('hideImages', v)}
                      />
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
                    </div>
                    <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg-elev/50 p-3">
                      <span className="text-sm font-semibold">{t.settings.cardDensityTitle}</span>
                      <span className="text-[11px] text-muted">{t.settings.cardDensityDesc}</span>
                      <CardDensitySlider className="mt-1 self-start" />
                    </div>
                  </div>
                )}

                {activeTab === 'content' && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Toggle
                      label={t.settings.blurR18}
                      description={t.settings.blurR18Desc}
                      value={settings.blurR18}
                      onChange={(v) => set('blurR18', v)}
                    />
                    <Toggle
                      label={t.settings.hideSexual}
                      description={t.settings.hideSexualDesc}
                      value={settings.hideSexual}
                      onChange={(v) => set('hideSexual', v)}
                    />
                    <label className="md:col-span-2 flex flex-col gap-1 rounded-lg border border-border bg-bg-elev/50 p-3">
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
                  </div>
                )}

                {activeTab === 'account' && (
                <div className="space-y-4">
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

                  {server?.vndb_token.hasToken && (
                    <div className="mt-3 rounded-md border border-border bg-bg-elev/30 p-3 text-xs">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="font-bold">{t.settings.vndbPullTitle}</div>
                          <div className="text-[10px] text-muted">{t.settings.vndbPullDesc}</div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary shrink-0"
                          onClick={onPullStatuses}
                          disabled={pulling}
                        >
                          {pulling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          {t.settings.vndbPullAction}
                        </button>
                      </div>
                      {pullDiff && (
                        <div className="mt-3 space-y-2 border-t border-border pt-3">
                          <div className="text-[10px] text-muted">
                            {t.settings.vndbPullDiffSummary
                              .replace('{updated}', String(pullDiff.updated))
                              .replace('{unchanged}', String(pullDiff.unchanged))
                              .replace('{skipped}', String(pullDiff.skippedNotInCollection))
                              .replace('{scanned}', String(pullDiff.scanned))}
                          </div>
                          {pullDiff.changes.length > 0 && (
                            <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                              {pullDiff.changes.map((c) => (
                                <li key={c.vn_id} className="flex items-center justify-between gap-2">
                                  <Link href={`/vn/${c.vn_id}`} target="_blank" rel="noopener noreferrer" className="truncate hover:text-accent">
                                    {c.title}
                                  </Link>
                                  <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted">
                                    {c.from ?? '—'}
                                    <ArrowRight className="h-3 w-3" aria-hidden />
                                    <span className="text-accent">{c.to}</span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {pullDiff.unmatched.length > 0 && (
                            <details className="text-[10px] text-muted">
                              <summary className="cursor-pointer">
                                {t.settings.vndbPullUnmatched.replace('{count}', String(pullDiff.unmatched.length))}
                              </summary>
                              <ul className="mt-1 space-y-0.5 pl-3">
                                {pullDiff.unmatched.map((u) => (
                                  <li key={u.vn_id}>
                                    <Link href={`/vn/${u.vn_id}`} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                                      {u.vn_id}
                                    </Link>
                                    <span className="ml-1">· {u.status}</span>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <label className="mt-4 flex items-start gap-2 rounded-md border border-border bg-bg-elev/30 p-3 text-xs">
                    <input
                      type="checkbox"
                      checked={!!server?.vndb_backup_enabled}
                      onChange={(e) => saveServer({ vndb_backup_enabled: e.target.checked })}
                      className="mt-0.5 h-4 w-4 accent-accent"
                    />
                    <span className="flex-1">
                      <span className="font-bold">{t.settings.vndbBackupTitle}</span>
                      <span className="block text-[10px] text-muted">{t.settings.vndbBackupDesc}</span>
                      {/*
                        Mask-aware editor. The GET response now
                        returns `{ hasUrl, host, isDefault }`
                        instead of echoing the raw URL — so the
                        editor starts empty (with a hostname-only
                        placeholder) and the user types a fresh
                        URL to replace. Clearing the field PATCHes
                        `null`, which falls back to the default
                        VNDB host.
                      */}
                      <input
                        type="url"
                        inputMode="url"
                        defaultValue=""
                        placeholder={
                          server?.vndb_backup_url?.host
                            ? `${server.vndb_backup_url.host}${
                                server.vndb_backup_url.isDefault ? ' · default' : ''
                              }`
                            : 'https://api.yorhel.org/kana'
                        }
                        aria-label={t.settings.vndbBackupTitle}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          // Empty submit = clear (falls back to default).
                          // Non-empty submit = replace.
                          if (v) {
                            saveServer({ vndb_backup_url: v });
                          } else if (server?.vndb_backup_url?.hasUrl) {
                            saveServer({ vndb_backup_url: null });
                          }
                        }}
                        className="input mt-2 w-full"
                      />
                      {server?.vndb_backup_url?.host && (
                        <span className="mt-1 block text-[10px] text-muted/80">
                          {t.settings.vndbBackupCurrentHost.replace('{host}', server.vndb_backup_url.host)}
                          {server.vndb_backup_url.isDefault
                            ? ` (${t.settings.vndbBackupDefaultSuffix})`
                            : ''}
                        </span>
                      )}
                    </span>
                  </label>

                </div>
                )}

                {activeTab === 'automation' && (
                <div className="space-y-3">
                  <h3 className="mb-1 text-sm font-bold">{t.settings.automationTitle}</h3>
                  <p className="mb-3 text-[11px] text-muted">{t.settings.automationDesc}</p>
                  <label className="flex items-start gap-2 rounded-md border border-border bg-bg-elev/30 p-3 text-xs">
                    <input
                      type="checkbox"
                      checked={server?.vndb_fanout !== false}
                      onChange={(e) => saveServer({ vndb_fanout: e.target.checked })}
                      className="mt-0.5 h-4 w-4 accent-accent"
                    />
                    <span>
                      <span className="font-bold">{t.settings.vndbFanoutTitle}</span>
                      <span className="block text-[10px] text-muted">{t.settings.vndbFanoutDesc}</span>
                    </span>
                  </label>
                </div>
                )}

                {activeTab === 'integrations' && (
                <div className="space-y-6">
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
                )}

                {activeTab === 'library' && (
                <div className="space-y-2">
                  <h3 className="mb-1 text-sm font-bold">{t.settings.libraryDefaultsTitle}</h3>
                  <p className="mb-3 text-[11px] text-muted">{t.settings.libraryDefaultsDesc}</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold text-muted">{t.settings.defaultSortTitle}</span>
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
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold text-muted">{t.settings.defaultOrderTitle}</span>
                      <select
                        className="input w-full"
                        value={server?.default_order ?? 'desc'}
                        onChange={(e) => saveServer({ default_order: e.target.value as 'asc' | 'desc' })}
                      >
                        <option value="desc">{t.library.sortDesc}</option>
                        <option value="asc">{t.library.sortAsc}</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold text-muted">{t.settings.defaultGroupTitle}</span>
                      <select
                        className="input w-full"
                        value={server?.default_group ?? 'none'}
                        onChange={(e) => saveServer({ default_group: e.target.value as GroupKey })}
                      >
                        <option value="none">{t.library.groupNone}</option>
                        <option value="status">{t.library.groupStatus}</option>
                        <option value="producer">{t.library.groupDeveloper}</option>
                        <option value="publisher">{t.library.groupPublisher}</option>
                        <option value="tag">{t.library.groupTag}</option>
                        <option value="series">{t.library.groupSeries}</option>
                        <option value="aspect">{t.library.groupAspect}</option>
                      </select>
                    </label>
                  </div>
                  <p className="mt-2 text-[10px] text-muted">{t.settings.libraryDefaultsUrlHint}</p>
                </div>
                )}

                {activeTab === 'home' && (
                  <HomeLayoutPanel
                    layout={server?.home_section_layout_v1 ?? DEFAULT_HOME_LAYOUT}
                    onChange={(next) => saveServer({ home_section_layout_v1: next })}
                  />
                )}

                {activeTab === 'vn-page' && (
                  <VnLayoutPanel
                    layout={server?.vn_detail_section_layout_v1 ?? defaultVnDetailLayoutV1()}
                    onSave={(next) => saveServer({ vn_detail_section_layout_v1: next })}
                    onReset={() => saveServer({ vn_detail_section_layout_v1: null })}
                  />
                )}

                <div className="mt-6 flex justify-between">
                  <button
                    type="button"
                    className="btn"
                    onClick={reset}
                    title={t.settings.resetDisplayHint}
                  >
                    {t.settings.resetDisplay}
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

/**
 * Manage home-page section visibility from inside the Settings modal.
 * Mirrors the per-strip "..." menu but with a flat list so the user
 * can restore sections they previously hid (when the strip is gone
 * from the home page the "..." menu is gone too).
 *
 * Each toggle issues an optimistic PATCH to /api/settings — same
 * envelope shape as the per-strip menu — and broadcasts a
 * `vn:home-layout-changed` event so live strips update without a
 * router.refresh().
 */
function HomeLayoutPanel({
  layout,
  onChange,
}: {
  layout: HomeSectionLayoutV1;
  onChange: (next: { sections?: Partial<HomeSectionLayoutV1['sections']>; order?: HomeSectionLayoutV1['order'] }) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(layout);

  useEffect(() => {
    setDraft(layout);
  }, [layout]);

  function persist(id: HomeSectionId, next: HomeSectionState) {
    setDraft((cur) => ({ ...cur, sections: { ...cur.sections, [id]: next } }));
    onChange({ sections: { [id]: next } });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(HOME_LAYOUT_EVENT, { detail: { sections: { [id]: next } } }),
      );
    }
  }
  const hiddenCount = HOME_SECTION_IDS.filter((id) => !draft.sections[id].visible).length;
  return (
    <div className="mt-6 border-t border-border pt-5">
      <h3 className="mb-1 text-sm font-bold">{t.homeSections.title}</h3>
      <p className="mb-3 text-[11px] text-muted">{t.homeSections.desc}</p>
      <ul className="space-y-2">
        {HOME_SECTION_IDS.map((id) => {
          const state = draft.sections[id];
          return (
            <li
              key={id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-elev/40 p-2 text-xs"
            >
              <span className={state.visible ? 'text-white' : 'text-muted'}>
                {t.homeSections.sectionLabels[id]}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => persist(id, { ...state, visible: !state.visible })}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
                    state.visible
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-muted hover:border-accent hover:text-accent'
                  }`}
                  aria-pressed={state.visible}
                >
                  <Eye className="h-3 w-3" aria-hidden />
                  {state.visible ? t.homeSections.show : t.homeSections.hide}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {hiddenCount === 0 && (
        <p className="mt-2 text-[10px] text-muted">{t.homeSections.hiddenNoneHint}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-[10px] text-muted">{t.homeSections.resetHint}</p>
        <button
          type="button"
          onClick={() => {
            setDraft(DEFAULT_HOME_LAYOUT);
            // Calling onChange with null is interpreted by the parent
            // as a "drop the row" intent; the route will treat that as
            // a reset.
            onChange({ sections: DEFAULT_HOME_LAYOUT.sections, order: DEFAULT_HOME_LAYOUT.order });
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent(HOME_LAYOUT_EVENT, { detail: { reset: true } }),
              );
            }
          }}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/30 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
          title={t.homeSections.resetHint}
        >
          <Settings2 className="h-3 w-3" aria-hidden />
          {t.homeSections.reset}
        </button>
      </div>
    </div>
  );
}

/**
 * Manage VN-page section visibility / collapse defaults from the
 * Settings modal. Same shape as HomeLayoutPanel: a flat list of every
 * registered section with show/hide + collapsed-by-default toggles
 * and a "Reset to defaults" button. Saves the whole layout in one
 * PATCH so the user's reorder (done from the VN page itself) isn't
 * clobbered by toggling visibility here — we read the current order
 * back and write it whole.
 */
function VnLayoutPanel({
  layout,
  onSave,
  onReset,
}: {
  layout: VnDetailLayoutV1;
  onSave: (next: VnDetailLayoutV1) => void;
  onReset: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(layout);

  useEffect(() => {
    setDraft(layout);
  }, [layout]);

  function patch(id: VnSectionId, partial: Partial<VnSectionState>) {
    setDraft((cur) => {
      const nextLayout: VnDetailLayoutV1 = {
        order: cur.order,
        sections: {
          ...cur.sections,
          [id]: { ...cur.sections[id], ...partial },
        },
      };
      onSave(nextLayout);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(VN_LAYOUT_EVENT, { detail: { layout: nextLayout } }),
        );
      }
      return nextLayout;
    });
  }

  const hiddenCount = VN_SECTION_IDS.filter((id) => !draft.sections[id].visible).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="mb-1 text-sm font-bold">{t.vnLayout.restoreTitle}</h3>
          <p className="text-[11px] text-muted">{t.vnLayout.restoreDesc}</p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-status-on_hold hover:text-status-on_hold"
        >
          {t.vnLayout.reset}
        </button>
      </div>
      <ul className="space-y-1.5">
        {draft.order.map((id) => {
          const state = draft.sections[id];
          return (
            <li
              key={id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-elev/40 px-2.5 py-1.5 text-xs"
            >
              <span className={state.visible ? 'text-white' : 'text-muted'}>
                {t.vnLayout.sectionLabels[id]}
              </span>
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-muted">
                  <input
                    type="checkbox"
                    checked={state.collapsedByDefault}
                    onChange={(e) => patch(id, { collapsedByDefault: e.target.checked })}
                    className="h-3 w-3 accent-accent"
                  />
                  {t.vnLayout.collapseByDefault}
                </label>
                <button
                  type="button"
                  onClick={() => patch(id, { visible: !state.visible })}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
                    state.visible
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-muted hover:border-accent hover:text-accent'
                  }`}
                  aria-pressed={state.visible}
                >
                  {state.visible ? <Eye className="h-3 w-3" aria-hidden /> : <EyeOff className="h-3 w-3" aria-hidden />}
                  {state.visible ? t.vnLayout.hide : t.vnLayout.show}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {hiddenCount === 0 && (
        <p className="text-[10px] text-muted">{t.vnLayout.hiddenNoneHint}</p>
      )}
    </div>
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
  const labelId = useId();
  const descId = useId();
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-bg-elev/50 p-3 hover:border-accent">
      <div className="min-w-0">
        <div id={labelId} className="text-sm font-semibold">{label}</div>
        <div id={descId} className="text-[11px] text-muted">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-labelledby={labelId}
        aria-describedby={descId}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${value ? 'bg-accent' : 'bg-bg-elev'}`}
      >
        <span
          className={`absolute top-0.5 left-0 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            value ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
