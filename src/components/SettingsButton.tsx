'use client';
import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useDialogA11y } from './Dialog';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, ChevronDown, ChevronUp, Download, Eye, EyeOff, GraduationCap, GripVertical, KeyRound, Loader2, Maximize2, Minimize2, RotateCcw, Save, Settings2, X } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CARD_DENSITY_DEFAULT,
  CARD_DENSITY_MAX,
  CARD_DENSITY_MIN,
  DENSITY_SCOPES,
  clampCardDensity,
  clearAllScopeDensities,
  hasScopeOverride,
  resolveScopedDensity,
  type DensityScope,
  type DensityScopes,
  useDisplaySettings,
} from '@/lib/settings/client';
import {
  PAGE_SPACE_PRESET_IDS,
  PAGE_SPACE_SCOPES,
  PAGE_SPACE_SCOPE_DEFAULTS,
  clearPageSpaceOverrides,
  hasPageSpaceOverride,
  resolvePageSpacePreset,
  type PageSpaceOverrides,
  type PageSpacePreset,
  type PageSpaceScope,
} from '@/lib/page-space';
import { GlobalCardDensitySlider } from './CardDensitySlider';
import { SkeletonBlock } from './Skeleton';
import { useLocale, useT } from '@/lib/i18n/client';
import {
  globalShortcutRows,
  pageShortcutSections,
  routeShortcutRows,
} from '@/lib/shortcut-registry';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import { fmtNum } from '@/lib/locale-number';
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
import { CollapsibleSummary } from './CollapsibleSummary';
import {
  CHARACTER_DETAIL_LAYOUT_EVENT,
  CHARACTER_SECTION_IDS,
  defaultCharacterDetailLayoutV1,
  validateCharacterDetailLayoutV1,
  type CharacterDetailLayoutV1,
  type CharacterSectionId,
} from '@/lib/character-detail-layout';
import {
  STAFF_DETAIL_LAYOUT_EVENT,
  STAFF_SECTION_IDS,
  defaultStaffDetailLayoutV1,
  validateStaffDetailLayoutV1,
  type StaffDetailLayoutV1,
  type StaffSectionId,
} from '@/lib/staff-detail-layout';
import {
  PRODUCER_DETAIL_LAYOUT_EVENT,
  PRODUCER_SECTION_IDS,
  defaultProducerDetailLayoutV1,
  validateProducerDetailLayoutV1,
  type ProducerDetailLayoutV1,
  type ProducerSectionId,
} from '@/lib/producer-detail-layout';
import {
  SERIES_DETAIL_LAYOUT_EVENT,
  SERIES_DETAIL_SECTION_IDS,
  defaultSeriesDetailLayoutV1,
  validateSeriesDetailLayoutV1,
  type SeriesDetailLayoutV1,
  type SeriesSectionId,
} from '@/lib/series-detail-layout';
import { startTour } from './TutorialTour';

import { readApiError } from '@/lib/api-error-read';
import {
  STOCK_PROVIDER_IDS,
  STOCK_PROVIDER_LABELS,
} from '@/lib/stock-provider-constants';
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

interface ProxyDisplayConfig {
  enabled: boolean;
  protocol: string;
  host: string;
  port: number | null;
  username: string;
  hasPassword: boolean;
}

interface ServerSettings {
  vndb_token: { hasToken: boolean; preview: string | null; envFallback: boolean };
  random_quote_source: 'all' | 'mine';
  default_sort: SortKey;
  default_order?: 'asc' | 'desc';
  default_group?: GroupKey;
  home_section_layout_v1?: HomeSectionLayoutV1;
  vn_detail_section_layout_v1?: VnDetailLayoutV1;
  series_detail_section_layout_v1?: SeriesDetailLayoutV1;
  character_detail_section_layout_v1?: CharacterDetailLayoutV1;
  staff_detail_section_layout_v1?: StaffDetailLayoutV1;
  producer_detail_section_layout_v1?: ProducerDetailLayoutV1;
  vndb_writeback?: boolean;
  vndb_backup_enabled?: boolean;
  vndb_backup_url?: { hasUrl: boolean; host: string | null; isDefault: boolean };
  vndb_fanout?: boolean;
  steam_api_key?: { hasKey: boolean; preview: string | null };
  steam_id?: string;
  egs_username?: string;
  vndb_proxy_config?: ProxyDisplayConfig;
  vndbmirror_proxy_config?: ProxyDisplayConfig;
  egs_proxy_config?: ProxyDisplayConfig;
  alicesoft_kobe_proxy_config?: ProxyDisplayConfig;
  stock_proxy_config?: ProxyDisplayConfig;
}

const SETTINGS_TABS = [
  'display',
  'content',
  'library',
  'vn-page',
  'account',
  'integrations',
  'automation',
  'shortcuts',
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

interface ProxySettingsSectionProps {
  t: ReturnType<typeof useT>;
  /** DB key — `<id>_proxy_config`. Used by the parent to wire onSave. */
  providerKey: string;
  /**
   * Provider id passed to `POST /api/proxy/test`. For fixed providers
   * (egs, vndb, vndbmirror, alicesoft_kobe, stock) this is the
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

function ProxySettingsSection({ t, providerId, label, config, onSave, compact = false }: ProxySettingsSectionProps) {
  const [showPw, setShowPw] = useState(false);
  // Audit (user feedback): the eye button used to toggle the input's
  // `type` between "password" and "text". Browsers (Chromium / Safari)
  // drop the typed value when an uncontrolled <input> changes its
  // `type` attribute mid-life — the toggle visibly did nothing and the
  // password field reset. Now we make the password row CONTROLLED via
  // `pwDraft` so the value survives the type swap, and persist on blur
  // exactly like before.
  const [pwDraft, setPwDraft] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; ms?: number; error?: string } | null>(null);
  const [testing, startTesting] = useTransition();
  // Stable per-instance ids so the labels above each input can wire up
  // an `htmlFor` association. Previously the sibling `<span>` carried
  // the visible text but the input had no programmatic name.
  const protocolId = useId();
  const hostId = useId();
  const portId = useId();
  const usernameId = useId();
  const passwordId = useId();
  const testDisabledHintId = useId();

  function handleTest() {
    startTesting(async () => {
      setTestResult(null);
      try {
        const res = await fetch('/api/proxy/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: providerId }),
        });
        const data = (await res.json()) as { ok: boolean; latencyMs?: number; error?: string };
        setTestResult(data.ok
          ? { ok: true, ms: data.latencyMs }
          : { ok: false, error: data.error ?? t.common.unknownError });
      } catch (e) {
        setTestResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    });
  }

  return (
    <section className={compact ? 'rounded border border-border bg-bg-elev/30 p-3' : 'border-t border-border pt-5'}>
      {compact ? (
        <h4 className="mb-2 text-[12px] font-bold">{label}</h4>
      ) : (
        <>
          <h3 className="mb-1 text-sm font-bold">
            {t.settings.proxyTitle} · {label}
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
            placeholder="proxy.example.com"
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
            placeholder="1080"
            onBlur={(e) => {
              const v = e.target.value.trim();
              onSave({ port: v ? Number(v) : null });
            }}
            className="input text-[11px]"
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
          <div className="flex items-center gap-1">
            <input
              id={passwordId}
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder={config?.hasPassword ? t.settings.proxyPasswordStored : t.settings.proxyPasswordPlaceholder}
              value={pwDraft}
              onChange={(e) => setPwDraft(e.target.value)}
              onBlur={(e) => {
                if (e.target.value) onSave({ password: e.target.value });
              }}
              className="input flex-1 text-[11px]"
            />
            <button
              type="button"
              // onMouseDown + preventDefault stops the password input
              // from losing focus when the eye button is clicked.
              // Without this, click → blur → input value persists but
              // the focus jump caused some browsers to lose the active
              // selection; preventing the default blur keeps the
              // caret in place.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowPw((v) => !v)}
              className="rounded p-1 text-muted hover:text-fg"
              aria-label={showPw ? t.settings.proxyPasswordHide : t.settings.proxyPasswordShow}
              aria-pressed={showPw}
            >
              {showPw ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
            </button>
          </div>
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

export function SettingsButton() {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { settings, set, reset } = useDisplaySettings();
  const { confirm } = useConfirm();
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
  const [activePageLayoutTab, setActivePageLayoutTab] = useState<'home' | 'vn' | 'character' | 'staff' | 'producer' | 'series'>('home');
  const [layoutSubTab, setLayoutSubTab] = useState<'perpage' | 'spacing' | 'sections'>('perpage');
  const PAGE_LAYOUT_TABS = ['home', 'vn', 'character', 'staff', 'producer', 'series'] as const;
  type PageLayoutTab = typeof PAGE_LAYOUT_TABS[number];
  const shortcutYear = new Date().getFullYear();
  const shortcutGlobalRows = globalShortcutRows(t);
  const shortcutRouteRows = routeShortcutRows(t, shortcutYear);
  const shortcutPageSections = pageShortcutSections(t);

  const loadAbortRef = useRef<AbortController | null>(null);

  const loadServer = useCallback(async () => {
    loadAbortRef.current?.abort();
    const ac = new AbortController();
    loadAbortRef.current = ac;
    try {
      const r = await fetch('/api/settings', { cache: 'no-store', signal: ac.signal });
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
    return () => { loadAbortRef.current?.abort(); };
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
      series_detail_section_layout_v1: SeriesDetailLayoutV1 | null;
      character_detail_section_layout_v1: CharacterDetailLayoutV1 | null;
      staff_detail_section_layout_v1: StaffDetailLayoutV1 | null;
      producer_detail_section_layout_v1: ProducerDetailLayoutV1 | null;
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
      vndb_proxy_config: Record<string, unknown>;
      vndbmirror_proxy_config: Record<string, unknown>;
      egs_proxy_config: Record<string, unknown>;
      alicesoft_kobe_proxy_config: Record<string, unknown>;
      stock_proxy_config: Record<string, unknown>;
    }>,
  ) {
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      toast.success(t.toast.saved);
      await loadServer();
      if (
        'home_section_layout_v1' in patch ||
        'vn_detail_section_layout_v1' in patch ||
        'character_detail_section_layout_v1' in patch ||
        'staff_detail_section_layout_v1' in patch ||
        'producer_detail_section_layout_v1' in patch ||
        'series_detail_section_layout_v1' in patch
      ) {
        startTransition(() => router.refresh());
      }
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
                  className="mb-5 flex gap-1 overflow-x-auto rounded-lg border border-border bg-bg-elev/30 p-1"
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
                    e.preventDefault();
                    const idx = SETTINGS_TABS.indexOf(activeTab);
                    let next: SettingsTab;
                    if (e.key === 'Home') next = SETTINGS_TABS[0];
                    else if (e.key === 'End') next = SETTINGS_TABS[SETTINGS_TABS.length - 1];
                    else if (e.key === 'ArrowRight') next = SETTINGS_TABS[(idx + 1) % SETTINGS_TABS.length];
                    else next = SETTINGS_TABS[(idx - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length];
                    setActiveTab(next);
                    document.getElementById(`settings-tab-${next}`)?.focus();
                  }}
                >
                  {SETTINGS_TABS.map((tab) => {
                    const active = activeTab === tab;
                    return (
                      <button
                        key={tab}
                        // R5-102: each tab carries the explicit
                        // `id` + `aria-controls` pair the panel
                        // below references via `aria-labelledby`,
                        // closing the tab/tabpanel wiring loop. The
                        // roving `tabIndex` (active=0, others=-1)
                        // keeps arrow-key navigation off until the
                        // active tab is focused — required by WAI-
                        // ARIA's authoring practices for tablists.
                        id={`settings-tab-${tab}`}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        aria-controls={`settings-panel-${tab}`}
                        tabIndex={active ? 0 : -1}
                        onClick={() => setActiveTab(tab)}
                        className={`inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
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
                  <div
                    role="tabpanel"
                    id="settings-panel-display"
                    aria-labelledby="settings-tab-display"
                    className="space-y-5"
                  >
                    {/*
                      IA bucket: "Global defaults". Image / title /
                      density preferences that ship app-wide. Per-
                      page overrides live in the dedicated subsection
                      below so the hierarchy is explicit (item 9).
                    */}
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted">
                      {t.settings.iaGlobalDefaults}
                    </h3>
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
                      <Toggle
                        label={t.settings.headerFollowsPageSpace}
                        description={t.settings.headerFollowsPageSpaceDesc}
                        value={settings.headerFollowsPageSpace}
                        onChange={(v) => set('headerFollowsPageSpace', v)}
                      />
                    </div>
                    <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg-elev/50 p-3">
                      <span className="text-sm font-semibold">{t.settings.cardDensityDefault}</span>
                      <span className="text-[11px] text-muted">{t.settings.cardDensityDefaultHint}</span>
                      <GlobalCardDensitySlider className="mt-1 self-start" />
                    </div>
                  </div>
                )}

                {activeTab === 'content' && (
                  <div
                    role="tabpanel"
                    id="settings-panel-content"
                    aria-labelledby="settings-tab-content"
                    className="grid gap-4 md:grid-cols-2"
                  >
                    {/*
                      R5-225: the tab is titled "Spoiler / Content"
                      but previously contained ONLY content gates
                      (blurR18, hideSexual, nsfwThreshold). Add an
                      explicit spoiler-level radio so the tab name
                      matches its body. The same control is mirrored
                      in the navbar popover (<SpoilerToggle/>); both
                      write to `settings.spoilerLevel` so they stay
                      in sync via the shared settings store.
                    */}
                    <div className="md:col-span-2 flex flex-col gap-2 rounded-lg border border-border bg-bg-elev/50 p-3">
                      <span className="text-sm font-semibold">{t.spoiler.title}</span>
                      <p className="text-[11px] text-muted">{t.spoiler.hint}</p>
                      <div role="radiogroup" aria-label={t.spoiler.title} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {[0, 1, 2].map((lvl) => {
                          const label =
                            lvl === 0 ? t.spoiler.lvl0 : lvl === 1 ? t.spoiler.lvl1 : t.spoiler.lvl2;
                          return (
                            <button
                              key={lvl}
                              type="button"
                              role="radio"
                              aria-checked={settings.spoilerLevel === lvl}
                              onClick={() => set('spoilerLevel', lvl as 0 | 1 | 2)}
                              className={`inline-flex min-h-[44px] items-center justify-center rounded-md border border-border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                settings.spoilerLevel === lvl
                                  ? 'border-accent bg-accent/15 text-accent'
                                  : 'text-muted hover:text-white'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
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
                      <span className="text-xs text-muted">{fmtNum(settings.nsfwThreshold, locale, 1)} / 2.0</span>
                    </label>
                  </div>
                )}

                {activeTab === 'account' && (
                <div
                  role="tabpanel"
                  id="settings-panel-account"
                  aria-labelledby="settings-tab-account"
                  className="space-y-4"
                >
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
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="password"
                      className="input min-w-[14rem] flex-1"
                      placeholder={t.settings.vndbTokenPlaceholder}
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      autoComplete="off"
                      aria-label={t.settings.vndbTokenPlaceholder}
                    />
                    <button
                      type="button"
                      className="btn btn-primary min-h-[44px]"
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
                      className="mt-2 inline-flex min-h-[44px] items-center rounded px-2 text-xs text-muted hover:text-status-dropped"
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
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-[180px] flex-1">
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
                            <details className="group text-[10px] text-muted">
                              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                                <CollapsibleSummary>
                                  {t.settings.vndbPullUnmatched.replace('{count}', String(pullDiff.unmatched.length))}
                                </CollapsibleSummary>
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
                <div
                  role="tabpanel"
                  id="settings-panel-automation"
                  aria-labelledby="settings-tab-automation"
                  className="space-y-4"
                >
                  <div>
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
                  <div className="rounded-md border border-border bg-bg-elev/30 p-3">
                    <h4 className="mb-0.5 text-xs font-bold">{t.tour.runAgain}</h4>
                    <p className="mb-2 text-[10px] text-muted">{t.tour.hint}</p>
                    <button
                      type="button"
                      onClick={() => { setOpen(false); startTour(); }}
                      className="btn text-xs"
                    >
                      <GraduationCap className="h-3.5 w-3.5" aria-hidden /> {t.tour.runAgain}
                    </button>
                  </div>
                </div>
                )}

                {activeTab === 'shortcuts' && (
                <div
                  role="tabpanel"
                  id="settings-panel-shortcuts"
                  aria-labelledby="settings-tab-shortcuts"
                  className="space-y-4"
                >
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                    <h3 className="text-sm font-bold">{t.shortcuts.title}</h3>
                  </div>
                  <p className="text-[11px] text-muted">
                    <kbd className="rounded bg-bg-elev px-1.5 py-0.5 font-mono text-[10px]">?</kbd>
                    {' '}— {t.shortcuts.help}
                  </p>
	                  <div className="space-y-3">
	                    <section>
	                      <h4 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">
	                        {t.shortcuts.title}
	                      </h4>
	                      <ul className="space-y-1.5">
	                        {shortcutGlobalRows.map((row) => (
	                          <ShortcutRow key={row.key} k={row.key} label={row.label} />
	                        ))}
	                      </ul>
	                    </section>
	                    <section>
	                      <h4 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">
	                        g
	                      </h4>
	                      <ul className="space-y-1.5">
	                        {shortcutRouteRows.map((row) => (
	                          <ShortcutRow key={row.key} k={row.key} label={row.label} />
	                        ))}
	                      </ul>
	                    </section>
	                    {shortcutPageSections.map((section) => (
	                      <section key={section.label}>
	                        <h4 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">
	                          {section.label}
	                        </h4>
	                        <ul className="space-y-1.5">
	                          {section.rows.map((row) => (
	                            <ShortcutRow key={row.key} k={row.key} label={row.label} />
	                          ))}
	                        </ul>
	                      </section>
	                    ))}
	                  </div>
                </div>
                )}

                {activeTab === 'integrations' && (
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
                    providerKey="alicesoft_kobe_proxy_config"
                    providerId="alicesoft_kobe"
                    label={t.settings.proxyProviderAliceKobe}
                    config={server?.alicesoft_kobe_proxy_config}
                    onSave={(patch) => saveServer({ alicesoft_kobe_proxy_config: patch })}
                  />
                  <ProxySettingsSection
                    t={t}
                    providerKey="stock_proxy_config"
                    providerId="stock"
                    label={t.settings.proxyProviderStock}
                    config={server?.stock_proxy_config}
                    onSave={(patch) => saveServer({ stock_proxy_config: patch })}
                  />

                  <section className="border-t border-border pt-5">
                    <details className="group">
                      <summary className="cursor-pointer text-sm font-bold hover:text-accent">
                        {t.settings.proxyShopOverridesTitle}
                        <ChevronDown className="inline-block h-3.5 w-3.5 align-baseline transition-transform group-open:rotate-180" aria-hidden />
                      </summary>
                      <p className="mb-3 mt-2 text-[11px] text-muted">{t.settings.proxyShopOverridesDesc}</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {STOCK_PROVIDER_IDS.map((id) => {
                          const dbKey = `${id}_proxy_config`;
                          const cfg = (server as Record<string, unknown> | null)?.[dbKey] as
                            | ProxyDisplayConfig
                            | undefined;
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
                )}

                {activeTab === 'library' && (
                <div
                  role="tabpanel"
                  id="settings-panel-library"
                  aria-labelledby="settings-tab-library"
                  className="space-y-2"
                >
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

                {activeTab === 'vn-page' && (
                  <div
                    role="tabpanel"
                    id="settings-panel-vn-page"
                    aria-labelledby="settings-tab-vn-page"
                    className="space-y-4"
                  >
                    <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-border bg-bg-elev/20 p-1">
                      {(['perpage', 'spacing', 'sections'] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setLayoutSubTab(tab)}
                          className={`min-h-[44px] shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                            layoutSubTab === tab
                              ? 'bg-accent text-bg'
                              : 'text-muted hover:text-white'
                          }`}
                        >
                          {tab === 'perpage' ? t.settings.layoutSubTabPages : tab === 'spacing' ? t.settings.layoutSubTabSpacing : t.settings.layoutSubTabSections}
                        </button>
                      ))}
                    </div>

                    {layoutSubTab === 'spacing' && (
                      <>
                        {/*
                          Global page width — applies the same preset to every
                          page at once. Per-page overrides below let you
                          fine-tune individual routes. Moved from Display tab
                          so all layout controls live in one place.
                        */}
                        <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg-elev/50 p-3">
                          <span className="text-sm font-semibold">{t.settings.globalPageWidth}</span>
                          <span className="text-[11px] text-muted">{t.settings.globalPageWidthHint}</span>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              aria-pressed={settings.globalPageSpace == null}
                              onClick={() => set('globalPageSpace', null)}
                              className={`min-h-[44px] rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${
                                settings.globalPageSpace == null
                                  ? 'border-accent bg-accent/15 text-accent'
                                  : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
                              }`}
                            >
                              {t.settings.globalPageWidthOff}
                            </button>
                            {PAGE_SPACE_PRESET_IDS.map((preset) => {
                              const active = settings.globalPageSpace === preset;
                              return (
                                <button
                                  key={preset}
                                  type="button"
                                  aria-pressed={active}
                                  onClick={() => set('globalPageSpace', preset)}
                                  className={`min-h-[44px] rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${
                                    active
                                      ? 'border-accent bg-accent/15 text-accent'
                                      : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
                                  }`}
                                >
                                  {t.pageSpace.preset[preset]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}

                    {layoutSubTab === 'perpage' && (
                      <>
                        {/*
                          Per-page width overrides — each route can override
                          the global preset (or card density) independently.
                        */}
                        <PerPageLayoutPanel />
                      </>
                    )}

                    {layoutSubTab === 'sections' && (
                      <>
                        {/*
                          Section ordering — drag-and-drop reorder or
                          hide/show sections on each detail page type.
                        */}
                        <nav
                          role="tablist"
                          aria-label={t.settings.tabs['vn-page']}
                          className="mb-4 inline-flex flex-wrap gap-1 rounded-md border border-border bg-bg-elev/30 p-1 text-xs"
                          onKeyDown={(e) => {
                            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
                            e.preventDefault();
                            const idx = PAGE_LAYOUT_TABS.indexOf(activePageLayoutTab as PageLayoutTab);
                            let next: PageLayoutTab;
                            if (e.key === 'Home') next = PAGE_LAYOUT_TABS[0];
                            else if (e.key === 'End') next = PAGE_LAYOUT_TABS[PAGE_LAYOUT_TABS.length - 1];
                            else if (e.key === 'ArrowRight') next = PAGE_LAYOUT_TABS[(idx + 1) % PAGE_LAYOUT_TABS.length];
                            else next = PAGE_LAYOUT_TABS[(idx - 1 + PAGE_LAYOUT_TABS.length) % PAGE_LAYOUT_TABS.length];
                            setActivePageLayoutTab(next);
                            document.getElementById(`page-layout-tab-${next}`)?.focus();
                          }}
                        >
                          {(
                            [
                              ['home', t.homeLayout.openEditor],
                              ['vn', t.vnLayout.restoreTitle],
                              ['character', t.characterLayout.restoreTitle],
                              ['staff', t.staffLayout.restoreTitle],
                              ['producer', t.producerLayout.restoreTitle],
                              ['series', t.seriesLayout.restoreTitle],
                            ] as const
                          ).map(([key, label]) => (
                            <button
                              key={key}
                              id={`page-layout-tab-${key}`}
                              type="button"
                              role="tab"
                              aria-selected={activePageLayoutTab === key}
                              aria-controls={`page-layout-panel-${key}`}
                              tabIndex={activePageLayoutTab === key ? 0 : -1}
                              onClick={() => setActivePageLayoutTab(key)}
                              className={`rounded px-2.5 py-1 ${activePageLayoutTab === key ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'}`}
                            >
                              {label}
                            </button>
                          ))}
                        </nav>
                        {activePageLayoutTab === 'home' && (
                          <div role="tabpanel" id="page-layout-panel-home" aria-labelledby="page-layout-tab-home">
                            <HomeLayoutPanel
                              layout={server?.home_section_layout_v1 ?? DEFAULT_HOME_LAYOUT}
                              onChange={(next) => saveServer({ home_section_layout_v1: next })}
                            />
                          </div>
                        )}
                        {activePageLayoutTab === 'vn' && (
                          <div role="tabpanel" id="page-layout-panel-vn" aria-labelledby="page-layout-tab-vn">
                            <VnLayoutPanel
                              layout={server?.vn_detail_section_layout_v1 ?? defaultVnDetailLayoutV1()}
                              onSave={(next) => saveServer({ vn_detail_section_layout_v1: next })}
                              onReset={() => saveServer({ vn_detail_section_layout_v1: null })}
                            />
                          </div>
                        )}
                        {activePageLayoutTab === 'character' && (
                          <div role="tabpanel" id="page-layout-panel-character" aria-labelledby="page-layout-tab-character">
                            <PageLayoutPanel
                              title={t.characterLayout.restoreTitle}
                              desc={t.characterLayout.restoreDesc}
                              resetLabel={t.characterLayout.reset}
                              layout={server?.character_detail_section_layout_v1 ?? defaultCharacterDetailLayoutV1()}
                              sectionIds={CHARACTER_SECTION_IDS}
                              sectionLabels={t.characterLayout.sectionLabels as Record<string, string>}
                              eventName={CHARACTER_DETAIL_LAYOUT_EVENT}
                              onSave={(next) => saveServer({ character_detail_section_layout_v1: next })}
                              onReset={() => saveServer({ character_detail_section_layout_v1: null })}
                            />
                          </div>
                        )}
                        {activePageLayoutTab === 'staff' && (
                          <div role="tabpanel" id="page-layout-panel-staff" aria-labelledby="page-layout-tab-staff">
                            <PageLayoutPanel
                              title={t.staffLayout.restoreTitle}
                              desc={t.staffLayout.restoreDesc}
                              resetLabel={t.staffLayout.reset}
                              layout={server?.staff_detail_section_layout_v1 ?? defaultStaffDetailLayoutV1()}
                              sectionIds={STAFF_SECTION_IDS}
                              sectionLabels={t.staffLayout.sectionLabels as Record<string, string>}
                              eventName={STAFF_DETAIL_LAYOUT_EVENT}
                              onSave={(next) => saveServer({ staff_detail_section_layout_v1: next })}
                              onReset={() => saveServer({ staff_detail_section_layout_v1: null })}
                            />
                          </div>
                        )}
                        {activePageLayoutTab === 'producer' && (
                          <div role="tabpanel" id="page-layout-panel-producer" aria-labelledby="page-layout-tab-producer">
                            <PageLayoutPanel
                              title={t.producerLayout.restoreTitle}
                              desc={t.producerLayout.restoreDesc}
                              resetLabel={t.producerLayout.reset}
                              layout={server?.producer_detail_section_layout_v1 ?? defaultProducerDetailLayoutV1()}
                              sectionIds={PRODUCER_SECTION_IDS}
                              sectionLabels={t.producerLayout.sectionLabels as Record<string, string>}
                              eventName={PRODUCER_DETAIL_LAYOUT_EVENT}
                              onSave={(next) => saveServer({ producer_detail_section_layout_v1: next })}
                              onReset={() => saveServer({ producer_detail_section_layout_v1: null })}
                            />
                          </div>
                        )}
                        {activePageLayoutTab === 'series' && (
                          <div role="tabpanel" id="page-layout-panel-series" aria-labelledby="page-layout-tab-series">
                            <PageLayoutPanel
                              title={t.seriesLayout.restoreTitle}
                              desc={t.seriesLayout.restoreDesc}
                              resetLabel={t.seriesLayout.reset}
                              layout={server?.series_detail_section_layout_v1 ?? defaultSeriesDetailLayoutV1()}
                              sectionIds={SERIES_DETAIL_SECTION_IDS}
                              sectionLabels={t.seriesLayout.sectionLabels as Record<string, string>}
                              eventName={SERIES_DETAIL_LAYOUT_EVENT}
                              onSave={(next) => saveServer({ series_detail_section_layout_v1: next })}
                              onReset={() => saveServer({ series_detail_section_layout_v1: null })}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="mt-6 flex justify-between">
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      const ok = await confirm({
                        message: t.settings.resetDisplayConfirm,
                        tone: 'danger',
                      });
                      if (ok) reset();
                    }}
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = draft.order.indexOf(active.id as HomeSectionId);
    const newIndex = draft.order.indexOf(over.id as HomeSectionId);
    if (oldIndex < 0 || newIndex < 0) return;
    const nextOrder = arrayMove(draft.order, oldIndex, newIndex);
    setDraft((cur) => ({ ...cur, order: nextOrder }));
    onChange({ order: nextOrder });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(HOME_LAYOUT_EVENT, { detail: { order: nextOrder } }));
    }
  }

  function toggleVisible(id: HomeSectionId) {
    const cur = draft.sections[id];
    const next: HomeSectionState = { ...cur, visible: !cur.visible };
    setDraft((d) => ({ ...d, sections: { ...d.sections, [id]: next } }));
    onChange({ sections: { [id]: next } });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(HOME_LAYOUT_EVENT, { detail: { sections: { [id]: next } } }));
    }
  }

  const hiddenCount = draft.order.filter((id) => !draft.sections[id].visible).length;
  return (
    <div className="mt-6 border-t border-border pt-5">
      <h3 className="mb-1 text-sm font-bold">{t.homeSections.title}</h3>
      <p className="mb-3 text-[11px] text-muted">{t.homeSections.desc}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={draft.order} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1.5">
            {draft.order.map((id) => (
              <SortableHomeLayoutRow
                key={id}
                id={id}
                visible={draft.sections[id]?.visible !== false}
                label={t.homeSections.sectionLabels[id]}
                onToggleVisible={() => toggleVisible(id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {hiddenCount === 0 && (
        <p className="mt-2 text-[10px] text-muted">{t.homeSections.hiddenNoneHint}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-[10px] text-muted">{t.homeSections.resetHint}</p>
        <button
          type="button"
          onClick={() => {
            setDraft(DEFAULT_HOME_LAYOUT);
            onChange({ sections: DEFAULT_HOME_LAYOUT.sections, order: DEFAULT_HOME_LAYOUT.order });
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent(HOME_LAYOUT_EVENT, { detail: { reset: true } }));
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

function SortableHomeLayoutRow({
  id,
  visible,
  label,
  onToggleVisible,
}: {
  id: string;
  visible: boolean;
  label: string;
  onToggleVisible: () => void;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-border bg-bg-elev/40 px-2 py-1.5 text-xs"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t.homeLayout.dragHandle}
        className="cursor-grab text-muted hover:text-white"
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden />
      </button>
      <span className={`flex-1 ${visible ? 'text-white' : 'text-muted line-through'}`}>{label}</span>
      <button
        type="button"
        onClick={onToggleVisible}
        aria-pressed={!visible}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
          visible
            ? 'border-accent bg-accent/10 text-accent'
            : 'border-border text-muted hover:border-accent hover:text-accent'
        }`}
      >
        {visible ? <Eye className="h-3 w-3" aria-hidden /> : <EyeOff className="h-3 w-3" aria-hidden />}
        {visible ? t.homeSections.show : t.homeSections.hide}
      </button>
    </li>
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = draft.order.indexOf(active.id as VnSectionId);
    const newIndex = draft.order.indexOf(over.id as VnSectionId);
    if (oldIndex < 0 || newIndex < 0) return;
    const nextOrder = arrayMove(draft.order, oldIndex, newIndex);
    setDraft((cur) => {
      const next: VnDetailLayoutV1 = { ...cur, order: nextOrder };
      onSave(next);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(VN_LAYOUT_EVENT, { detail: { layout: next } }));
      }
      return next;
    });
  }

  function patch(id: VnSectionId, partial: Partial<VnSectionState>) {
    setDraft((cur) => {
      const next: VnDetailLayoutV1 = {
        order: cur.order,
        sections: { ...cur.sections, [id]: { ...cur.sections[id], ...partial } },
      };
      onSave(next);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(VN_LAYOUT_EVENT, { detail: { layout: next } }));
      }
      return next;
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
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={draft.order} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1.5">
            {draft.order.map((id) => (
              <SortableDetailRow
                key={id}
                id={id}
                visible={draft.sections[id]?.visible !== false}
                collapsedByDefault={draft.sections[id]?.collapsedByDefault ?? false}
                label={t.vnLayout.sectionLabels[id]}
                collapseLabel={t.vnLayout.collapseByDefault}
                showLabel={t.vnLayout.show}
                hideLabel={t.vnLayout.hide}
                dragHandleLabel={t.homeLayout.dragHandle}
                onToggleVisible={() => patch(id, { visible: !draft.sections[id].visible })}
                onToggleCollapse={(v) => patch(id, { collapsedByDefault: v })}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {hiddenCount === 0 && (
        <p className="text-[10px] text-muted">{t.vnLayout.hiddenNoneHint}</p>
      )}
    </div>
  );
}

/**
 * Generic collapsed-by-default accordion panel for any detail-page
 * section layout (character, staff, producer, series). Same contract
 * as VnLayoutPanel but parameterised — avoids copy-pasting.
 */
function PageLayoutPanel<Id extends string>({
  title,
  desc,
  resetLabel,
  layout,
  sectionIds,
  sectionLabels,
  eventName,
  onSave,
  onReset,
}: {
  title: string;
  desc: string;
  resetLabel: string;
  layout: { order: Id[]; sections: Record<Id, { visible: boolean; collapsedByDefault: boolean }> };
  sectionIds: readonly Id[];
  sectionLabels: Record<string, string>;
  eventName: string;
  onSave: (next: typeof layout) => void;
  onReset: () => void;
}) {
  const t = useT();
  const panelId = useId();
  const [draft, setDraft] = useState(layout);
  const [open, setOpen] = useState(true);

  useEffect(() => { setDraft(layout); }, [layout]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = draft.order.indexOf(active.id as Id);
    const newIndex = draft.order.indexOf(over.id as Id);
    if (oldIndex < 0 || newIndex < 0) return;
    const nextOrder = arrayMove(draft.order, oldIndex, newIndex);
    setDraft((cur) => {
      const next = { ...cur, order: nextOrder };
      onSave(next);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(eventName, { detail: { layout: next } }));
      }
      return next;
    });
  }

  function patch(id: Id, partial: Partial<{ visible: boolean; collapsedByDefault: boolean }>) {
    setDraft((cur) => {
      const next = {
        order: cur.order,
        sections: { ...cur.sections, [id]: { ...cur.sections[id], ...partial } },
      };
      onSave(next);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(eventName, { detail: { layout: next } }));
      }
      return next;
    });
  }

  const hiddenCount = sectionIds.filter((id) => !draft.sections[id]?.visible).length;

  return (
    <div className="border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          <p className="text-[11px] text-muted">{desc}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hiddenCount > 0 && (
            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">{hiddenCount}</span>
          )}
          {open
            ? <ChevronUp className="h-3.5 w-3.5 text-muted" aria-hidden />
            : <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden />
          }
        </div>
      </button>
      {open && (
        <div id={panelId} className="mt-3 space-y-2">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-status-on_hold hover:text-status-on_hold"
            >
              {resetLabel}
            </button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={draft.order} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1.5">
                {draft.order.map((id) => {
                  if (!draft.sections[id]) return null;
                  return (
                    <SortableDetailRow
                      key={id}
                      id={id}
                      visible={draft.sections[id]?.visible !== false}
                      collapsedByDefault={draft.sections[id]?.collapsedByDefault ?? false}
                      label={sectionLabels[id] ?? id}
                      collapseLabel={t.vnLayout.collapseByDefault}
                      showLabel={t.vnLayout.show}
                      hideLabel={t.vnLayout.hide}
                      dragHandleLabel={t.homeLayout.dragHandle}
                      onToggleVisible={() => patch(id, { visible: !draft.sections[id].visible })}
                      onToggleCollapse={(v) => patch(id, { collapsedByDefault: v })}
                    />
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

function SortableDetailRow({
  id,
  visible,
  collapsedByDefault,
  label,
  collapseLabel,
  showLabel,
  hideLabel,
  dragHandleLabel,
  onToggleVisible,
  onToggleCollapse,
}: {
  id: string;
  visible: boolean;
  collapsedByDefault: boolean;
  label: string;
  collapseLabel: string;
  showLabel: string;
  hideLabel: string;
  dragHandleLabel: string;
  onToggleVisible: () => void;
  onToggleCollapse: (v: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-border bg-bg-elev/40 px-2 py-1.5 text-xs"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={dragHandleLabel}
        className="cursor-grab text-muted hover:text-white"
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden />
      </button>
      <span className={`flex-1 ${visible ? 'text-white' : 'text-muted line-through'}`}>{label}</span>
      <label className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-muted">
        <input
          type="checkbox"
          checked={collapsedByDefault}
          onChange={(e) => onToggleCollapse(e.target.checked)}
          className="h-3 w-3 accent-accent"
        />
        {collapseLabel}
      </label>
      <button
        type="button"
        onClick={onToggleVisible}
        aria-pressed={!visible}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
          visible
            ? 'border-accent bg-accent/10 text-accent'
            : 'border-border text-muted hover:border-accent hover:text-accent'
        }`}
      >
        {visible ? <Eye className="h-3 w-3" aria-hidden /> : <EyeOff className="h-3 w-3" aria-hidden />}
        {visible ? hideLabel : showLabel}
      </button>
    </li>
  );
}

const PAGE_LAYOUT_DENSITY_SCOPES: Partial<Record<PageSpaceScope, readonly DensityScope[]>> = {
  library: ['library'],
  wishlist: ['wishlist'],
  search: ['search'],
  vn: ['vnMedia'],
  staff: ['staffWorks'],
  character: ['characterWorks'],
  producer: ['producerWorks'],
  series: ['seriesWorks'],
  lists: ['lists'],
  shelf: ['shelf'],
  recommendations: ['recommendations'],
  topRanked: ['topRanked'],
  upcoming: ['upcoming'],
  similar: ['vnSimilar'],
  tags: ['tagPage'],
  dumped: ['dumped'],
  egs: ['egs'],
};

/**
 * Settings → Display panel for per-page layout overrides. It combines
 * page spacing and scoped card-density state in one row per route
 * group, so Display no longer has two competing "per-page" panels.
 *
 * @returns Settings block for route-group layout overrides.
 */
function PerPageLayoutPanel() {
  const t = useT();
  const { settings, set } = useDisplaySettings();
  const { confirm } = useConfirm();
  const [hydrated, setHydrated] = useState(false);
  const pageSpace = settings.pageSpace ?? {};
  const density = settings.density ?? {};

  useEffect(() => {
    setHydrated(true);
  }, []);

  function setScopePreset(scope: PageSpaceScope, preset: PageSpacePreset) {
    const next: PageSpaceOverrides = { ...pageSpace };
    if (preset === PAGE_SPACE_SCOPE_DEFAULTS[scope]) delete next[scope];
    else next[scope] = preset;
    set('pageSpace', next);
  }

  function resetSpaceScope(scope: PageSpaceScope) {
    const next: PageSpaceOverrides = { ...pageSpace };
    delete next[scope];
    set('pageSpace', next);
  }

  function setScopeDensity(scope: DensityScope, px: number) {
    set('density', { ...density, [scope]: clampCardDensity(px) });
  }

  function resetDensityScope(scope: DensityScope) {
    const next: DensityScopes = { ...density };
    delete next[scope];
    set('density', next);
  }

  function resetAllDensityScopes() {
    set('density', clearAllScopeDensities(settings));
  }

  function resetAllSpaceScopes() {
    set('pageSpace', clearPageSpaceOverrides());
  }

  function resetEverything() {
    set('pageSpace', clearPageSpaceOverrides());
    set('density', clearAllScopeDensities(settings));
    set('cardDensityPx', CARD_DENSITY_DEFAULT);
  }

  const someSpaceOverride = PAGE_SPACE_SCOPES.some((scope) => hasPageSpaceOverride(settings, scope));
  const someDensityOverride = DENSITY_SCOPES.some((scope) => hasScopeOverride(settings, scope));

  if (!hydrated) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg-elev/50 p-3" aria-busy="true">
        <SkeletonBlock className="h-4 w-44" />
        <SkeletonBlock className="h-3 w-72" />
        <div className="mt-1 grid gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-16 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg-elev/50 p-3">
      <span className="text-sm font-semibold">{t.settings.perPageLayout}</span>
      <span className="text-[11px] text-muted">{t.settings.perPageLayoutHint}</span>
      <ul className="mt-1 grid gap-2">
        {PAGE_SPACE_SCOPES.map((scope) => {
          const activePreset = resolvePageSpacePreset(settings, scope);
          const spaceOverridden = hasPageSpaceOverride(settings, scope);
          const densityScopes = PAGE_LAYOUT_DENSITY_SCOPES[scope] ?? [];
          return (
            <li
              key={scope}
              className="grid gap-2 rounded-md border border-border/60 bg-bg-card/40 px-2 py-2 text-[11px] xl:grid-cols-[minmax(8rem,0.8fr)_minmax(18rem,1.4fr)_minmax(9rem,0.8fr)]"
            >
              <div className="min-w-0">
                <span className={spaceOverridden ? 'block text-white' : 'block text-muted'}>
                  {t.pageSpace.scope[scope]}
                </span>
                <span className="block text-[10px] text-muted/80">
                  {spaceOverridden
                    ? t.pageSpace.customOverride
                    : t.pageSpace.defaultPreset.replace(
                        '{preset}',
                        t.pageSpace.preset[PAGE_SPACE_SCOPE_DEFAULTS[scope]],
                      )}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {PAGE_SPACE_PRESET_IDS.map((preset) => {
                  const active = preset === activePreset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setScopePreset(scope, preset)}
                      className={`min-h-[44px] rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${
                        active
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-accent'
                      }`}
                    >
                      {active && <Check className="mr-1 inline h-3 w-3" aria-hidden />}
                      {t.pageSpace.preset[preset]}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => resetSpaceScope(scope)}
                  disabled={!spaceOverridden}
                  className="min-h-[44px] rounded-md border border-border bg-bg-elev/40 px-3 py-1 text-xs text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted"
                  title={t.settings.pageSpaceReset}
                >
                  {t.settings.pageSpaceReset}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1 xl:justify-end">
                {densityScopes.length > 0 ? (
                  densityScopes.map((densityScope) => {
                    const overridden = hasScopeOverride(settings, densityScope);
                    const resolved = resolveScopedDensity(settings, densityScope, null);
                    return (
                      <span
                        key={densityScope}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 ${
                          overridden ? 'border-accent/40 bg-accent/5' : 'border-border bg-bg-elev/40'
                        }`}
                        title={overridden ? t.settings.densityReset : t.settings.followsDefault}
                      >
                        <button
                          type="button"
                          onClick={() => setScopeDensity(densityScope, resolved - 20)}
                          aria-label={t.cardDensity.denser}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted hover:text-accent"
                        >
                          <Minimize2 className="h-3 w-3" aria-hidden />
                        </button>
                        <input
                          type="range"
                          min={CARD_DENSITY_MIN}
                          max={CARD_DENSITY_MAX}
                          step={10}
                          value={resolved}
                          onChange={(e) => setScopeDensity(densityScope, Number(e.target.value))}
                          aria-label={t.cardDensity.label}
                          className="h-1.5 w-20 cursor-pointer accent-accent"
                        />
                        <button
                          type="button"
                          onClick={() => setScopeDensity(densityScope, resolved + 20)}
                          aria-label={t.cardDensity.larger}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted hover:text-accent"
                        >
                          <Maximize2 className="h-3 w-3" aria-hidden />
                        </button>
                        <span className={`w-9 text-right text-[10px] tabular-nums ${overridden ? 'text-accent' : 'text-muted/80'}`}>
                          {resolved}px
                        </span>
                        <button
                          type="button"
                          onClick={() => resetDensityScope(densityScope)}
                          disabled={!overridden}
                          aria-label={t.settings.densityReset}
                          title={t.settings.densityReset}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted hover:text-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-muted"
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden />
                        </button>
                      </span>
                    );
                  })
                ) : (
                  <span className="text-[10px] italic text-muted/70">{t.settings.noDensityControl}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
        <button
          type="button"
          onClick={resetAllSpaceScopes}
          disabled={!someSpaceOverride}
          className="min-h-[44px] rounded-md border border-border bg-bg-elev/40 px-3 py-1 text-xs text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted"
        >
          {t.settings.pageSpaceResetAll}
        </button>
        <button
          type="button"
          onClick={resetAllDensityScopes}
          disabled={!someDensityOverride}
          className="min-h-[44px] rounded-md border border-border bg-bg-elev/40 px-3 py-1 text-xs text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted"
        >
          {t.settings.perPageResetAll}
        </button>
        <button
          type="button"
          onClick={async () => {
            const ok = await confirm({
              message: t.settings.resetEverythingConfirm,
              tone: 'danger',
            });
            if (ok) resetEverything();
          }}
          className="min-h-[44px] rounded-md border border-border bg-bg-elev/40 px-3 py-1 text-xs text-muted hover:border-status-dropped hover:text-status-dropped"
        >
          {t.settings.resetEverything}
        </button>
      </div>
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

function ShortcutRow({ k, label }: { k: string; label: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <kbd className="rounded bg-bg-elev px-2 py-0.5 font-mono text-[11px]">{k}</kbd>
      <span className="text-[11px] text-muted">{label}</span>
    </li>
  );
}
