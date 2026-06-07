'use client';
import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useDialogA11y } from './Dialog';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { ArrowRight, Download, GraduationCap, KeyRound, Loader2, Save, Settings2, X } from 'lucide-react';
import { useDisplaySettings } from '@/lib/settings/client';
import { GlobalCardDensitySlider } from './CardDensitySlider';
import { SkeletonRows } from './Skeleton';
import { useLocale, useT } from '@/lib/i18n/client';
import {
  globalShortcutRows,
  pageShortcutSections,
  routeShortcutRows,
} from '@/lib/shortcut-registry';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import { fmtNum } from '@/lib/locale-number';
import type { HomeSectionLayoutV1 } from '@/lib/home-section-layout';
import type { VnDetailLayoutV1 } from '@/lib/vn-detail-layout';
import { CollapsibleSummary } from './CollapsibleSummary';
import type { CharacterDetailLayoutV1 } from '@/lib/character-detail-layout';
import type { StaffDetailLayoutV1 } from '@/lib/staff-detail-layout';
import type { ProducerDetailLayoutV1 } from '@/lib/producer-detail-layout';
import type { SeriesDetailLayoutV1 } from '@/lib/series-detail-layout';
import { startTour } from './TutorialTour';

import { readApiError } from '@/lib/api-error-read';
import {
  decodeServerSettingsResponse,
  decodeVndbPullStatusResult,
  type ServerSettings,
  type ServerSettingsGroupKey as GroupKey,
  type ServerSettingsSortKey as SortKey,
  type VndbPullStatusDiff as PullDiff,
} from '@/lib/settings-server-client-shape';

const LayoutSettingsTab = dynamic(
  () => import('./settings/LayoutSettingsTab').then((m) => m.LayoutSettingsTab),
  { ssr: false, loading: () => <SkeletonRows count={6} withThumb={false} /> },
);

const IntegrationsSettingsTab = dynamic(
  () => import('./settings/IntegrationsSettingsTab').then((m) => m.IntegrationsSettingsTab),
  { ssr: false, loading: () => <SkeletonRows count={6} withThumb={false} /> },
);

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

/**
 * Patch shape accepted by `saveServer`. Shared with the lazily-loaded
 * tab bodies (`LayoutSettingsTab`, `IntegrationsSettingsTab`) so they
 * can call the same PATCH handler without re-declaring the surface.
 */
export type ServerSettingsPatch = Partial<{
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
    egs_username: string | null;
    vndb_proxy_config: Record<string, unknown>;
    vndbmirror_proxy_config: Record<string, unknown>;
    egs_proxy_config: Record<string, unknown>;
    stock_proxy_config: Record<string, unknown>;
    stock_disabled_providers: string[] | null;
    stock_retry_without_proxy: boolean;
}>;

export type SaveServer = (patch: ServerSettingsPatch) => Promise<boolean>;

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
  // URL or storage - the user almost always re-enters the modal via
  // the gear icon (or "All settings..." from the spoiler popover) on a
  // specific concern and the freshest landing is Display.
  const [activeTab, setActiveTab] = useState<SettingsTab>('display');
  const shortcutYear = new Date().getFullYear();
  const shortcutGlobalRows = globalShortcutRows(t);
  const shortcutRouteRows = routeShortcutRows(t, shortcutYear);
  const shortcutPageSections = pageShortcutSections(t);

  const loadAbortRef = useRef<AbortController | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveAbortRef = useRef<AbortController | null>(null);
  const pullAbortRef = useRef<AbortController | null>(null);
  const pullInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const loadServer = useCallback(async () => {
    loadAbortRef.current?.abort();
    const ac = new AbortController();
    loadAbortRef.current = ac;
    try {
      const r = await fetch('/api/settings', { cache: 'no-store', signal: ac.signal });
      if (!r.ok) return;
      const settings = decodeServerSettingsResponse(await r.json());
      if (settings && loadAbortRef.current === ac && !ac.signal.aborted) setServer(settings);
    } catch {
      // ignore - modal still works for client-side prefs
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadServer();
      setTokenInput('');
    }
    return () => {
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
      pullAbortRef.current?.abort();
      pullAbortRef.current = null;
      pullInFlightRef.current = false;
      setPulling(false);
    };
  }, [open, loadServer]);

  function saveServer(patch: ServerSettingsPatch): Promise<boolean> {
    const task = saveQueueRef.current.then(async () => {
      if (!mountedRef.current) return false;
      const controller = new AbortController();
      saveAbortRef.current = controller;
      try {
        const r = await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
          signal: controller.signal,
        });
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        if (!mountedRef.current || saveAbortRef.current !== controller || controller.signal.aborted) return false;
        toast.success(t.toast.saved);
        await loadServer();
        if (!mountedRef.current || saveAbortRef.current !== controller || controller.signal.aborted) return false;
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
        return true;
      } catch (e) {
        if (!mountedRef.current || saveAbortRef.current !== controller || controller.signal.aborted) return false;
        toast.error((e as Error).message);
        return false;
      } finally {
        if (saveAbortRef.current === controller) saveAbortRef.current = null;
      }
    });
    saveQueueRef.current = task.then(() => undefined);
    return task;
  }

  async function onSaveToken() {
    setSavingToken(true);
    const saved = await saveServer({ vndb_token: tokenInput.trim() });
    if (!mountedRef.current) return;
    setSavingToken(false);
    if (saved) setTokenInput('');
  }

  const [pulling, setPulling] = useState(false);
  const [pullDiff, setPullDiff] = useState<PullDiff | null>(null);
  async function onPullStatuses() {
    if (pullInFlightRef.current) return;
    const controller = new AbortController();
    pullAbortRef.current?.abort();
    pullAbortRef.current = controller;
    pullInFlightRef.current = true;
    setPulling(true);
    try {
      const r = await fetch('/api/vndb/pull-statuses', { method: 'POST', signal: controller.signal });
      const data = decodeVndbPullStatusResult(await r.json().catch(() => null));
      if (!r.ok || !data?.ok) {
        throw new Error(data?.message ?? t.common.error);
      }
      if (!mountedRef.current || pullAbortRef.current !== controller || controller.signal.aborted) return;
      toast.success(`${t.settings.vndbPullDone} (${data.updated}/${data.scanned})`);
      setPullDiff({
        scanned: data.scanned,
        updated: data.updated,
        unchanged: data.unchanged,
        skippedNotInCollection: data.skippedNotInCollection,
        changes: data.changes,
        unmatched: data.unmatched,
      });
      // Updated statuses changed local DB state - reload the surrounding
      // server component so card status badges reflect the new values.
      startTransition(() => router.refresh());
    } catch (e) {
      if (!mountedRef.current || pullAbortRef.current !== controller || controller.signal.aborted) return;
      toast.error((e as Error).message);
    } finally {
      if (pullAbortRef.current === controller) {
        pullAbortRef.current = null;
        pullInFlightRef.current = false;
        setPulling(false);
      }
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    setMounted(true);
    return () => {
      mountedRef.current = false;
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
      saveAbortRef.current?.abort();
      saveAbortRef.current = null;
      pullAbortRef.current?.abort();
      pullAbortRef.current = null;
      pullInFlightRef.current = false;
    };
  }, []);

  // External "open me" trigger (dispatched by SpoilerToggle's
  // "Open full settings" button and by /data's "Manage in
  // Settings -> Integrations" callout buttons).
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
                  Tab strip - replaces the previous long scroll of
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
                      {savingToken ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
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
                          {pulling ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
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
                                    {c.from ?? '-'}
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
                                    <span className="ml-1">/ {u.status}</span>
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
                        instead of echoing the raw URL - so the
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
                                server.vndb_backup_url.isDefault ? ` / ${t.settings.vndbBackupDefaultSuffix}` : ''
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
                    {' '} - {t.shortcuts.help}
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
                >
                  <IntegrationsSettingsTab server={server} saveServer={saveServer} />
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
                >
                  <LayoutSettingsTab server={server} saveServer={saveServer} />
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
