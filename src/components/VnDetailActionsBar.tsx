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
import { BannerSourcePicker } from './BannerSourcePicker';
import { CompareWithButton } from './CompareWithButton';
import { CoverQuickActions } from './CoverQuickActions';
import { CoverSourcePicker } from './CoverSourcePicker';
import { DownloadAssetsButton } from './DownloadAssetsButton';
import { FavoriteToggleButton } from './FavoriteToggleButton';
import { LinkToVndbButton } from './LinkToVndbButton';
import { ListsPickerButton } from './ListsPickerButton';
import { MapVnToEgsButton } from './MapVnToEgsButton';
import { QueueButton } from './QueueButton';

/**
 * Detail-page action toolbar — third acceptance-gate rework.
 *
 * The previous regroup kept the six logical clusters but rendered as
 * a heterogeneous wall of buttons: primary buttons and dropdown
 * triggers shared the same `btn` class with mismatched paddings,
 * heights drifted between 32 px (FavoriteToggle inline) and 40 px
 * (CoverQuickActions add), and the destructive cluster nestled in
 * the same row as the tracking primaries with no visual separator.
 *
 * This pass keeps the six clusters but pins their visual hierarchy:
 *
 *   - One responsive flex stack: on mobile (<md) the bar is a column
 *     where each row stacks vertically (primaries, dropdowns, danger),
 *     separated by a `border-t` rule between dropdowns and danger so
 *     destructive actions visibly belong to a different band.
 *   - On md+ everything is a single row with `gap-3` between clusters
 *     and a `h-6 w-px bg-border/40` vertical separator between the
 *     primary cluster and the dropdown cluster. The danger cluster is
 *     pushed right via `md:ml-auto` with its own `md:border-l`
 *     vertical divider so the destructive button sits visually apart.
 *   - Every primary button inside the inline cluster is normalised to
 *     `h-9` via the parent's Tailwind arbitrary variant. Padding is
 *     tuned down to `py-1.5` so the natural line-height fits the 36 px
 *     box without overflowing. Icon size is locked at `h-4 w-4`.
 *   - Each dropdown trigger keeps the `btn` class but is rendered
 *     through `<ActionMenu>` which already appends `<ChevronDown>` and
 *     `aria-haspopup="menu"`. The trigger sits inside the second flex
 *     row on mobile, alongside the primaries on desktop.
 *   - The External links dropdown is a 2-column icon grid where every
 *     cell shows the lucide `ExternalLink` glyph + the label (long
 *     URLs truncate with a tooltip).
 *
 * Gating from the previous rework is preserved:
 *   - Media + Tracking + Dangerous gate on `inCollection`.
 *   - Data gates on `!isEgsOnly` (NOT `inCollection`).
 *   - Mapping renders unconditionally.
 *   - External gates on `showExternalMenu`.
 *
 * The `tests/vn-detail-collection-gating.test.ts` greps the source
 * for those gating expressions — the const declarations below must
 * keep their `const x = condition ?` shape so the pin doesn't fire.
 */
interface Props {
  /** Full VN row — used to derive titles, extlinks, custom banner, etc. */
  vn: CollectionItem;
  /** Whether the VN is in the local collection. Gates several controls. */
  inCollection: boolean;
  /** Resolved EGS row (if any). Drives the View-on-EGS anchor + cover picker. */
  egsRow: { egs_id: number | null; image_url?: string | null } | null;
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
 * `complete` here — the Data cluster gates them out via `!isEgsOnly`
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

/**
 * Wrapper classes applied to the primary-buttons row. Tailwind's
 * arbitrary variants are used to enforce a uniform `h-9` height +
 * `py-1.5` padding on every child `.btn` (button or anchor) so the
 * row doesn't drift heights when components mix custom padding into
 * their `btn` class string. `gap-2` matches the spec.
 */
const PRIMARY_ROW_CLASSES =
  'flex flex-wrap items-center gap-2 ' +
  '[&_a.btn]:h-9 [&_a.btn]:px-3 [&_a.btn]:py-1.5 ' +
  '[&_button.btn]:h-9 [&_button.btn]:px-3 [&_button.btn]:py-1.5';

/**
 * Dropdown-cluster classes — same `h-9` lock but tighter horizontal
 * padding so the chevron caret rendered by `<ActionMenu>` reads as
 * part of the trigger rather than an afterthought. `gap-2` between
 * triggers; rows INSIDE each dropdown panel use `gap-1.5` (set on
 * each menu's body separately).
 */
const DROPDOWN_ROW_CLASSES =
  'flex flex-wrap items-center gap-2 ' +
  '[&_button.btn]:h-9 [&_button.btn]:px-3 [&_button.btn]:py-1.5';

export async function VnDetailActionsBar({ vn, inCollection, egsRow }: Props) {
  const t = await getDict();
  const isEgsOnly = vn.id.startsWith('egs_');
  const screenshots: Screenshot[] = vn.screenshots ?? [];
  const releaseImages: ReleaseImage[] = vn.release_images ?? [];
  const extlinks = vn.extlinks ?? [];
  const hasExtlinks = extlinks.length > 0;
  const showExternalMenu = !isEgsOnly || hasExtlinks || !!egsRow?.egs_id;

  // ── Cluster 1: Collection (inline only — NO dropdown) ────────────
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
  // to grow beyond its four primaries.
  const tracking = inCollection ? (
    <ActionMenu
      label={t.detail.actions.groupTracking}
      trigger={
        <>
          <ListChecks className="h-4 w-4" aria-hidden /> {t.detail.actions.groupTracking}
        </>
      }
      triggerClassName="btn"
      menuClassName="w-56 rounded-lg border border-border bg-bg-card p-1 shadow-card"
      defaultPlacement="bottom-left"
    >
      <div
        className="flex flex-col gap-1.5"
        role="group"
        aria-label={t.detail.actions.groupTracking}
      >
        <TrackingAnchor href="#section-series" label={t.detail.seriesSection} />
        <TrackingAnchor href="#section-edit" label={t.form.myTracking} />
        <TrackingAnchor href="#section-notes" label={t.form.personalNotes} />
        <TrackingAnchor href="#section-owned" label={t.inventory.section} />
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
          <ExternalLink className="h-4 w-4" aria-hidden /> {t.detail.actions.groupExternal}
        </>
      }
      triggerClassName="btn"
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

  // ── Cluster 4: Media (single dropdown) ──────────────────────────
  const media = inCollection ? (
    <ActionMenu
      label={t.detail.actions.groupMedia}
      trigger={
        <>
          <ImageIcon className="h-4 w-4" aria-hidden /> {t.detail.actions.groupMedia}
        </>
      }
      triggerClassName="btn"
      menuClassName="w-56 rounded-lg border border-border bg-bg-card p-2 shadow-card"
      defaultPlacement="bottom-left"
    >
      <div
        className="flex flex-col gap-1.5"
        role="group"
        aria-label={t.detail.actions.groupMedia}
      >
        <CoverSourcePicker
          vnId={vn.id}
          vndbImage={vn.image_url}
          egsId={egsRow?.egs_id ?? null}
          currentCustomCover={vn.custom_cover ?? null}
          screenshots={screenshots}
          releaseImages={releaseImages}
        />
        <BannerSourcePicker
          vnId={vn.id}
          currentBanner={vn.banner_image ?? null}
          coverRemote={vn.image_url}
          coverLocal={vn.local_image || vn.local_image_thumb}
          coverSexual={vn.image_sexual ?? null}
          screenshots={screenshots}
          releaseImages={releaseImages}
        />
      </div>
    </ActionMenu>
  ) : null;

  // ── Cluster 5: Data (single dropdown) ──────────────────────────
  // Intentionally NOT gated on collection — the operator can still
  // need the VNDB metadata refresh from a search-hit landing. See
  // `tests/vn-detail-collection-gating.test.ts` for the pin.
  const data = !isEgsOnly ? (
    <ActionMenu
      label={t.detail.actions.groupData}
      trigger={
        <>
          <Database className="h-4 w-4" aria-hidden /> {t.detail.actions.groupData}
        </>
      }
      triggerClassName="btn"
      menuClassName="w-72 rounded-lg border border-border bg-bg-card p-2 shadow-card"
      defaultPlacement="bottom-left"
    >
      <DownloadAssetsButton vnId={vn.id} dataState={deriveVnDataState(vn)} />
    </ActionMenu>
  ) : null;

  // ── Cluster 6: Mapping (single dropdown) ────────────────────────
  const mapping = (
    <ActionMenu
      label={t.detail.actions.groupMapping}
      trigger={
        <>
          <Link2 className="h-4 w-4" aria-hidden /> {t.detail.actions.groupMapping}
        </>
      }
      triggerClassName="btn"
      menuClassName="w-64 rounded-lg border border-border bg-bg-card p-2 shadow-card"
      defaultPlacement="bottom-right"
    >
      <div
        className="flex flex-col gap-1.5"
        role="group"
        aria-label={t.detail.actions.groupMapping}
      >
        <CompareWithButton currentVnId={vn.id} />
        {!isEgsOnly && (
          <MapVnToEgsButton
            vnId={vn.id}
            seedQuery={vn.alttitle?.trim() || vn.title}
            variant="inline"
          />
        )}
        {isEgsOnly && (
          <LinkToVndbButton vnId={vn.id} seedQuery={vn.alttitle?.trim() || vn.title} />
        )}
      </div>
    </ActionMenu>
  );

  // The dropdown cluster groups every secondary dropdown trigger
  // into a single row on desktop. Empty entries are filtered out so
  // a missing menu (e.g. `tracking` on an out-of-collection VN)
  // doesn't leave dead whitespace.
  const dropdownTriggers = [tracking, external, media, data, mapping].filter(Boolean);

  // ── Destructive (rendered last, right-anchored on md+) ───────────
  const dangerous = inCollection ? (
    <div
      role="group"
      aria-label={t.detail.actions.groupDangerous}
      className={
        // On mobile: full-width row separated from the dropdowns
        // above by a `border-t` rule + top padding so the
        // destructive action visually belongs to a different band.
        // On desktop: right-anchored with `md:ml-auto`, a left
        // vertical divider, and no top border (the desktop divider
        // already carries the separation duty).
        'mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 ' +
        'md:mt-0 md:ml-auto md:border-l md:border-t-0 md:border-border/60 md:pl-3 md:pt-0 ' +
        '[&_button.btn]:h-9 [&_button.btn]:px-3 [&_button.btn]:py-1.5'
      }
    >
      <CoverQuickActions vnId={vn.id} inCollection={inCollection} mode="danger" />
    </div>
  ) : null;

  return (
    <nav
      aria-label={t.detail.actions.ariaLabel}
      className="mt-3 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3"
    >
      {collection}
      {/*
        Desktop-only vertical separator between the primary inline
        cluster and the dropdown cluster. On mobile each cluster
        already lives on its own row, so the divider would be a
        rotated 1-pixel sliver — hidden via `hidden md:inline-block`.
      */}
      {dropdownTriggers.length > 0 && (
        <span
          aria-hidden
          className="hidden h-6 w-px shrink-0 self-center bg-border/40 md:inline-block"
        />
      )}
      {dropdownTriggers.length > 0 && (
        <div
          role="group"
          aria-label={t.detail.actions.ariaLabel}
          className={DROPDOWN_ROW_CLASSES}
        >
          {dropdownTriggers.map((trigger, i) => (
            <span key={i} className="contents">
              {trigger}
            </span>
          ))}
        </div>
      )}
      {dangerous}
    </nav>
  );
}

/**
 * Grid cell inside the External-links dropdown. Renders the lucide
 * `ExternalLink` glyph + a label; opens in a new tab with `rel`
 * hardening. The label is truncated with a tooltip carrying the full
 * text so a long URL doesn't break the layout.
 */
function ExternalLinkGridItem({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      role="menuitem"
      className="inline-flex items-center gap-1.5 truncate rounded-md border border-border bg-bg-elev px-2 py-1.5 text-xs text-muted hover:border-accent hover:text-accent"
      title={label}
    >
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </a>
  );
}

/**
 * Anchor link inside the Tracking dropdown — jumps to a section
 * further down the VN page so the inline row never grows beyond
 * its four primary buttons.
 */
function TrackingAnchor({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      role="menuitem"
      className="rounded-md px-2 py-1.5 text-xs text-muted hover:bg-bg-elev hover:text-white"
    >
      {label}
    </a>
  );
}
