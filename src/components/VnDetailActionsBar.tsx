import React from 'react';
import {
  Database,
  ExternalLink,
  Link2,
  ListChecks,
  ImageIcon,
} from 'lucide-react';
import type { CollectionItem, ReleaseImage, Screenshot } from '@/lib/types';
import { getDict } from '@/lib/i18n/server';
import { ActionMenu } from './ActionMenu';
import { AnimeChip } from './AnimeChip';
import { BannerControls } from './BannerControls';
import { BannerSourcePicker } from './BannerSourcePicker';
import { CompareWithButton } from './CompareWithButton';
import { CoverQuickActions } from './CoverQuickActions';
import { CoverPickerTrigger } from './CoverPickerTrigger';
import { CoverSourcePicker } from './CoverSourcePicker';
import { CoverUploader } from './CoverUploader';
import { DownloadAssetsButton } from './DownloadAssetsButton';
import { FavoriteToggleButton } from './FavoriteToggleButton';
import { LinkToVndbButton } from './LinkToVndbButton';
import { ListsPickerButton } from './ListsPickerButton';
import { MapVnToEgsButton } from './MapVnToEgsButton';
import { QueueButton } from './QueueButton';
import { safeHref } from '@/lib/safe-href';
import type { SourceChoice } from '@/lib/source-resolve';

/**
 * Detail-page action toolbar.
 *
 * The toolbar keeps collection actions, secondary menus, and destructive
 * actions on one compact responsive surface. Control sizing is pinned on
 * the actual buttons instead of row-level child selectors, which prevents
 * menu wrappers and nested controls from inheriting unintended spacing.
 *
 * Gating from the previous rework is preserved:
 *   - Media + Tracking + Dangerous gate on `inCollection`.
 *   - Data gates on `!isEgsOnly` (NOT `inCollection`).
 *   - Mapping renders unconditionally.
 *   - External gates on `showExternalMenu`.
 *
 * The `tests/vn-detail-collection-gating.test.ts` greps the source
 * for those gating expressions - the const declarations below must
 * keep their `const x = condition ?` shape so the pin doesn't fire.
 */
interface Props {
  /** Full VN row - used to derive titles, extlinks, custom banner, etc. */
  vn: CollectionItem;
  /** Whether the VN is in the local collection. Gates several controls. */
  inCollection: boolean;
  /** Resolved EGS row (if any). Drives the View-on-EGS anchor + cover picker. */
  egsRow: { egs_id: number | null; image_url?: string | null } | null;
  /** Whether the resolved EGS poster actually carries an image (remote or local). Gates the EGS cover tab. */
  egsHasImage: boolean;
  /** Whether the VN has a custom banner set (gates the banner reset button). */
  hasCustomBanner: boolean;
  /** Active VN image-source preference. */
  imageSourcePref: SourceChoice;
}

/**
 * Compute the tri-state download label for a VN. The data state
 * controls the primary CTA inside the Data cluster:
 *   - `none`     → "Télécharger les données" / "Download data"
 *   - `partial`  → "Mettre à jour" / "Update data"
 *   - `complete` → "Télécharger ce qui manque" / "Download missing"
 *
 * Heuristics, ordered:
 *   1. No `fetched_at` at all (or 0) → none.
 *   2. Missing primary metadata (title is the synthetic id form) → none.
 *   3. `fetched_at` older than 30 days OR no local cover OR no platforms
 *      list → partial.
 *   4. Otherwise → complete.
 *
 * Synthetic / EGS-only ids (`egs_*`) bypass VNDB and always read as
 * `complete` here - the Data cluster gates them out via `!isEgsOnly`
 * upstream, so the value never reaches the DownloadAssetsButton.
 */
function deriveVnDataState(vn: CollectionItem): 'none' | 'partial' | 'complete' {
  if (vn.id.startsWith('egs_')) return 'complete';
  if (!vn.fetched_at || vn.fetched_at === 0) return 'none';
  if (!vn.title || vn.title === vn.id) return 'none';
  const AGE_30D_MS = 30 * 24 * 60 * 60 * 1000;
  const ageMs = Date.now() - vn.fetched_at;
  const stale = ageMs > AGE_30D_MS;
  const missingCover = !vn.local_image && !vn.local_image_thumb;
  const missingPlatforms = !vn.platforms || vn.platforms.length === 0;
  if (stale || missingCover || missingPlatforms) return 'partial';
  return 'complete';
}

const PRIMARY_ROW_CLASSES =
  'flex flex-wrap items-center gap-2';

const ACTION_BUTTON_CLASSES =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-border bg-bg-elev/40 px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent hover:text-white disabled:cursor-not-allowed disabled:opacity-50';

export async function VnDetailActionsBar({ vn, inCollection, egsRow, egsHasImage, hasCustomBanner, imageSourcePref }: Props) {
  const t = await getDict();
  const isEgsOnly = vn.id.startsWith('egs_');
  const screenshots: Screenshot[] = vn.screenshots ?? [];
  const releaseImages: ReleaseImage[] = vn.release_images ?? [];
  const extlinks = vn.extlinks ?? [];
  const hasExtlinks = extlinks.length > 0;
  const showExternalMenu = !isEgsOnly || hasExtlinks || !!egsRow?.egs_id;
  const coverPicker = (
    <CoverSourcePicker
      vnId={vn.id}
      vndbImage={vn.image_url}
      egsId={egsRow?.egs_id ?? null}
      egsHasImage={egsHasImage}
      currentCustomCover={vn.custom_cover ?? null}
      currentImageSource={imageSourcePref}
      currentRotation={
        ((vn.cover_rotation ?? 0) as 0 | 90 | 180 | 270)
      }
      screenshots={screenshots}
      releaseImages={releaseImages}
      showTrigger={false}
    />
  );

  // ── Cluster 1: Collection (inline only - NO dropdown) ────────────
  // The four primary buttons (favorite, wishlist heart, queue, lists)
  // sit in the first row. AnimeChip is passive and folds in next to
  // them on desktop (it's a span, not a button, and stays out of the
  // h-9 enforcement so its compact pill shape survives).
  const collection = (
    <div
      role="group"
      aria-label={t.detail.actions.groupCollection}
      className={PRIMARY_ROW_CLASSES}
    >
      {inCollection && (
        <FavoriteToggleButton
          vnId={vn.id}
          initial={!!vn.favorite}
          inCollection
          variant="inline"
        />
      )}
      <CoverQuickActions vnId={vn.id} inCollection={inCollection} mode="tracking" />
      {inCollection && <QueueButton vnId={vn.id} />}
      <ListsPickerButton vnId={vn.id} variant="inline" />
      {inCollection && <AnimeChip vnId={vn.id} />}
    </div>
  );

  // ── Cluster 2: Tracking (single dropdown) ────────────────────────
  // Anchor links inside the dropdown jump to the in-page sections
  // (notes / series / owned-editions) so the inline row never has
  // to grow beyond its four primaries. The destructive "Remove from
  // collection" action lives below a separator at the bottom of this
  // dropdown instead of being a separate cluster.
  const tracking = inCollection ? (
    <ActionMenu
      label={t.detail.actions.groupTracking}
      trigger={
        <>
          <ListChecks className="h-3.5 w-3.5" aria-hidden /> {t.detail.actions.groupTracking}
        </>
      }
      triggerClassName={ACTION_BUTTON_CLASSES}
      menuClassName="w-56 rounded-lg border border-border bg-bg-card p-1 shadow-card"
      defaultPlacement="bottom-left"
    >
      <div
        className="flex flex-col gap-1.5"
        role="group"
        aria-label={t.detail.actions.groupTracking}
      >
        <TrackingAnchor href="#section-edit-form" label={t.detail.seriesSection} />
        <TrackingAnchor href="#section-edit-form" label={t.form.myTracking} />
        <TrackingAnchor href="#section-notes" label={t.form.personalNotes} />
        <TrackingAnchor href="#section-my-editions" label={t.inventory.section} />
      </div>
    </ActionMenu>
  ) : null;

  // ── Cluster 3: External links (single dropdown) ─────────────────
  // 2-column icon grid; every row shows icon + label so the operator
  // can read where each link goes (the previous flat 10-icon row
  // hid every label behind a tooltip).
  const external = showExternalMenu ? (
    <ActionMenu
      label={t.detail.actions.groupExternal}
      trigger={
        <>
          <ExternalLink className="h-3.5 w-3.5" aria-hidden /> {t.detail.actions.groupExternal}
        </>
      }
      triggerClassName={ACTION_BUTTON_CLASSES}
      menuClassName="w-72 rounded-lg border border-border bg-bg-card p-2 shadow-card"
      defaultPlacement="bottom-left"
    >
      <div
        className="grid grid-cols-2 gap-1.5"
        role="group"
        aria-label={t.detail.actions.groupExternal}
      >
        {!isEgsOnly && (
          <ExternalLinkGridItem
            href={`https://vndb.org/${vn.id}`}
            label={t.detail.viewOnVndb}
          />
        )}
        {egsRow?.egs_id && (
          <ExternalLinkGridItem
            href={`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${egsRow.egs_id}`}
            label={t.detail.viewOnEgs}
          />
        )}
        {extlinks.map((l) => (
          <ExternalLinkGridItem key={l.url} href={l.url} label={l.label} />
        ))}
      </div>
    </ActionMenu>
  ) : null;

  // ── Cluster 4: Media/Artwork (single dropdown) ─────────────────
  // Combines cover/banner pickers (source selection) with direct
  // upload controls (custom file upload) so the operator never
  // needs to scroll to a separate "Custom artwork" card section.
  const media = inCollection ? (
    <ActionMenu
      label={t.detail.actions.groupMedia}
      trigger={
        <>
          <ImageIcon className="h-3.5 w-3.5" aria-hidden /> {t.detail.actions.groupMedia}
        </>
      }
      triggerClassName={ACTION_BUTTON_CLASSES}
      menuClassName="w-64 rounded-lg border border-border bg-bg-card p-2 shadow-card"
      defaultPlacement="bottom-left"
    >
      <div
        className="flex flex-col gap-2"
        role="group"
        aria-label={t.detail.actions.groupMedia}
      >
        <CoverPickerTrigger vnId={vn.id} className={ACTION_BUTTON_CLASSES} />
        <BannerSourcePicker
          vnId={vn.id}
          currentBanner={vn.banner_image ?? null}
          coverRemote={vn.image_url}
          coverLocal={vn.local_image || vn.local_image_thumb}
          coverSexual={vn.image_sexual ?? null}
          screenshots={screenshots}
          releaseImages={releaseImages}
          triggerClassName={ACTION_BUTTON_CLASSES}
        />
        <div className="border-t border-border/50 pt-2">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
            {t.detail.actions.groupMedia}
          </div>
          <div className="flex flex-col gap-1.5">
            <CoverUploader vnId={vn.id} hasCustom={!!vn.custom_cover} variant="inline" />
            <BannerControls vnId={vn.id} hasCustomBanner={hasCustomBanner} variant="inline" />
          </div>
        </div>
      </div>
    </ActionMenu>
  ) : null;

  // ── Cluster 5: Data (single dropdown) ──────────────────────────
  // Intentionally NOT gated on collection - the operator can still
  // need the VNDB metadata refresh from a search-hit landing. See
  // `tests/vn-detail-collection-gating.test.ts` for the pin.
  const data = !isEgsOnly ? (
    <ActionMenu
      label={t.detail.actions.groupData}
      trigger={
        <>
          <Database className="h-3.5 w-3.5" aria-hidden /> {t.detail.actions.groupData}
        </>
      }
      triggerClassName={ACTION_BUTTON_CLASSES}
      menuClassName="w-72 rounded-lg border border-border bg-bg-card p-2 shadow-card"
      defaultPlacement="bottom-left"
    >
      <DownloadAssetsButton vnId={vn.id} dataState={deriveVnDataState(vn)} variant="menu" />
    </ActionMenu>
  ) : null;

  // ── Cluster 6: Mapping (single dropdown) ────────────────────────
  // CompareWithButton / MapVnToEgsButton / LinkToVndbButton each
  // manage their own dialog state. They set data-menu-keep-open on
  // their trigger so ActionMenu does NOT unmount the panel on click -
  // keeping the component mounted long enough for the dialog state to
  // take effect. The dialog renders at z-[1000] on top; Escape closes
  // both the dialog and the ActionMenu in one keystroke.
  const mapping = (
    <ActionMenu
      label={t.detail.actions.groupMapping}
      trigger={
        <>
          <Link2 className="h-3.5 w-3.5" aria-hidden /> {t.detail.actions.groupMapping}
        </>
      }
      triggerClassName={ACTION_BUTTON_CLASSES}
      menuClassName="w-56 rounded-lg border border-border bg-bg-card p-1 shadow-card"
      defaultPlacement="bottom-right"
    >
      <div className="flex flex-col gap-0.5">
        <CompareWithButton
          currentVnId={vn.id}
          triggerClassName="inline-flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-bg-elev hover:text-white"
          keepMenuOpen
        />
        {!isEgsOnly && (
          <MapVnToEgsButton
            vnId={vn.id}
            seedQuery={vn.alttitle?.trim() || vn.title}
            variant="inline"
            keepMenuOpen
          />
        )}
        {isEgsOnly && (
          <LinkToVndbButton
            vnId={vn.id}
            seedQuery={vn.alttitle?.trim() || vn.title}
            triggerClassName="inline-flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-bg-elev hover:text-white"
            keepMenuOpen
          />
        )}
      </div>
    </ActionMenu>
  );

  return (
    <>
      <nav
        aria-label={t.detail.actions.ariaLabel}
        className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-bg-elev/25 p-2"
      >
        {collection}
        {tracking}
        {external}
        {media}
        {data}
        {mapping}
        {inCollection && <CoverQuickActions vnId={vn.id} inCollection={inCollection} mode="danger" />}
      </nav>
      {coverPicker}
    </>
  );
}

/**
 * Grid cell inside the External-links dropdown. Renders the lucide
 * `ExternalLink` glyph + a label; opens in a new tab with `rel`
 * hardening. The label is truncated with a tooltip carrying the full
 * text so a long URL doesn't break the layout.
 *
 * Items carry role="menuitem" and are reachable via CSS selector [role="menuitem"].
 */
function ExternalLinkGridItem({ href, label }: { href: string; label: string }) {
  const safe = safeHref(href);
  if (!safe) return null;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      role="menuitem"
      className="inline-flex min-h-[44px] items-center gap-1.5 truncate rounded-md border border-border bg-bg-elev px-2 py-1.5 text-xs text-muted hover:border-accent hover:text-accent"
      title={label}
    >
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </a>
  );
}

/**
 * Anchor link inside the Tracking dropdown - jumps to a section
 * further down the VN page so the inline row never grows beyond
 * its four primary buttons.
 */
function TrackingAnchor({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      role="menuitem"
      className="inline-flex min-h-[44px] items-center rounded-md px-2 py-1.5 text-xs text-muted hover:bg-bg-elev hover:text-white"
    >
      {label}
    </a>
  );
}
