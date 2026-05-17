import { Database, ExternalLink, MoreHorizontal } from 'lucide-react';
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
import { QueueButton } from './QueueButton';

/**
 * Detail-page action toolbar, regrouped per the second-round manual
 * QA. The earlier inline-cluster layout still rendered every button
 * above the fold — the External-links column alone could spill into a
 * 12-wide row on a tag-heavy VN. The new layout keeps only the
 * primary tracking affordances (favorite, wishlist heart, queue,
 * Lists) visible and folds the rest into labeled dropdowns:
 *
 *   1. Collection  — status/add/remove + wishlist + favorite + queue + lists
 *   2. Tracking    — series suggestions live inside <SeriesAutoSuggest>;
 *                    we only host the `<AnimeChip>` informational pill here
 *                    so it stays beside the tracked-state controls
 *   3. External    — every VNDB extlink, plus VNDB / EGS / migration links,
 *                    rendered as an icon grid INSIDE a single dropdown
 *   4. Media       — cover / banner source pickers (open their own dialogs)
 *   5. Data        — download missing + full refresh wrapped together
 *   6. More        — compare, EGS↔VNDB migration, mapping affordances
 *
 * Each cluster keeps its own `role="group"` so screen readers still
 * announce the grouping; only the primary cluster (Collection) is
 * always inline. The destructive Remove stays anchored to the right
 * via `md:ml-auto` and goes through `<CoverQuickActions mode='danger'>`
 * which already pairs with the shared <ConfirmDialog> for the
 * irreversible delete.
 */
interface Props {
  /** Full VN row — used to derive titles, extlinks, custom banner, etc. */
  vn: CollectionItem;
  /** Whether the VN is in the local collection. Gates several controls. */
  inCollection: boolean;
  /** Resolved EGS row (if any). Drives the View-on-EGS anchor + cover picker. */
  egsRow: { egs_id: number | null; image_url?: string | null } | null;
}

export async function VnDetailActionsBar({ vn, inCollection, egsRow }: Props) {
  const t = await getDict();
  const isEgsOnly = vn.id.startsWith('egs_');
  const screenshots: Screenshot[] = vn.screenshots ?? [];
  const releaseImages: ReleaseImage[] = vn.release_images ?? [];
  // Show every external link inside the dropdown — the manual QA
  // explicitly called out the 12-wide flat row as the worst offender
  // when a VN advertises a long Wikipedia / Wikidata / MobyGames /
  // IGDB / HowLongToBeat / GameFAQs / VGMdb / ACDB chain.
  const extlinks = vn.extlinks ?? [];
  const hasExtlinks = extlinks.length > 0;
  const showExternalMenu = !isEgsOnly || hasExtlinks || !!egsRow?.egs_id;

  // ── Cluster 1: Collection (always inline) ────────────────────────
  // Two-to-four primary buttons above the fold: favorite, wishlist,
  // queue, Lists. Add/Remove still ride inside <CoverQuickActions>
  // (`mode='tracking'` for Add, `mode='danger'` for Remove) so the
  // confirm dialog plumbing stays in one place.
  const collection = (
    <ActionGroup label={t.detail.actions.groupCollection}>
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
    </ActionGroup>
  );

  // ── Cluster 2: Tracking (informational) ─────────────────────────
  // The notes/save tracking editor and series-membership pickers
  // live in `<EditForm>` and `<SeriesAutoSuggest>`, both rendered
  // outside this bar by the VN page itself. The only thing left
  // here is the AnimeChip — a passive informational badge that
  // pairs naturally with the tracked-state controls.
  const tracking = inCollection ? (
    <ActionGroup label={t.detail.actions.groupTracking}>
      <AnimeChip vnId={vn.id} />
    </ActionGroup>
  ) : null;

  // ── Cluster 3: External links (single dropdown) ─────────────────
  // The trigger sits inline; the menu body is an icon grid where
  // each cell shows the lucide `ExternalLink` glyph plus the label.
  // VNDB / EGS / EGS-to-VNDB migration anchors live at the top of
  // the grid so they're the most prominent options.
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
        className="grid grid-cols-2 gap-1"
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

  // ── Cluster 4: Media ─────────────────────────────────────────────
  // Both source pickers open their own dialogs — keep the triggers
  // inline so the labels stay visible. Hidden until the VN is in the
  // collection because the underlying writes target `collection`.
  const media = inCollection ? (
    <ActionGroup label={t.detail.actions.groupMedia}>
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
    </ActionGroup>
  ) : null;

  // ── Cluster 5: Data / download ───────────────────────────────────
  // The existing <DownloadAssetsButton> renders TWO buttons (missing
  // + full refresh). Folding both inside a single dropdown removes
  // them from the always-visible row while keeping the same handlers.
  // We re-render the component inside the menu body; the popover
  // closes automatically when the user clicks either inner button
  // (via the bubbling click handler on <ActionMenu>'s panel).
  const data = inCollection ? (
    <ActionMenu
      label={t.detail.actions.groupData}
      trigger={
        <>
          <Database className="h-4 w-4" aria-hidden /> {t.detail.actions.groupData}
        </>
      }
      triggerClassName="btn"
      menuClassName="w-64 rounded-lg border border-border bg-bg-card p-2 shadow-card"
      defaultPlacement="bottom-left"
    >
      {/*
        Padding wrapper keeps the existing DownloadAssetsButton's
        own `flex-wrap gap-2` layout from butting against the menu's
        rounded border. The data-menu-keep-open attribute is NOT set
        here — the menu auto-closes on click of either inner button,
        matching the user expectation that the dropdown collapses
        after a single action.
      */}
      <DownloadAssetsButton vnId={vn.id} />
    </ActionMenu>
  ) : null;

  // ── Cluster 6: More (compare / mapping) ──────────────────────────
  // Compare and the EGS-to-VNDB id migration both open large modals,
  // so wrapping them in a "More" menu trades a single click for a
  // much cleaner default row. CompareWithButton manages its own
  // Dialog; LinkToVndbButton only appears for synthetic egs_* ids.
  const more = (
    <ActionMenu
      label={t.detail.actions.groupMore}
      trigger={
        <>
          <MoreHorizontal className="h-4 w-4" aria-hidden /> {t.detail.actions.groupMore}
        </>
      }
      triggerClassName="btn"
      menuClassName="w-56 rounded-lg border border-border bg-bg-card p-2 shadow-card"
      defaultPlacement="bottom-right"
    >
      {/*
        Each row is a self-contained component that owns its own
        click handler. The menu's bubbling onClick closes the
        dropdown on any internal anchor/button activation.
      */}
      <div className="flex flex-col gap-1">
        <CompareWithButton currentVnId={vn.id} />
        {isEgsOnly && (
          <LinkToVndbButton vnId={vn.id} seedQuery={vn.alttitle?.trim() || vn.title} />
        )}
      </div>
    </ActionMenu>
  );

  // ── Destructive (rendered last, pushed right) ────────────────────
  const dangerous = inCollection ? (
    <ActionGroup label={t.detail.actions.groupDangerous} tone="danger">
      <CoverQuickActions vnId={vn.id} inCollection={inCollection} mode="danger" />
    </ActionGroup>
  ) : null;

  // Build the linear list, skipping empty clusters so we never render
  // a stray separator.
  const blocks = [collection, tracking, external, media, data, more, dangerous].filter(Boolean);

  return (
    <nav
      aria-label={t.detail.actions.ariaLabel}
      className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2"
    >
      {blocks.map((g, i) => (
        <div key={i} className="contents">
          {g}
          {i < blocks.length - 1 && (
            <span
              aria-hidden
              className="hidden h-7 w-px shrink-0 self-center bg-border/70 md:inline-block"
            />
          )}
        </div>
      ))}
    </nav>
  );
}

/**
 * Single action cluster shell. Same role/`aria-label` contract as the
 * pre-regroup version, but the `tone='danger'` variant now pushes the
 * cluster right-aligned on `md+` so the destructive Remove button
 * sits visually apart.
 */
function ActionGroup({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: 'danger';
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex flex-wrap items-center gap-2 ${
        tone === 'danger' ? 'md:ml-auto' : ''
      }`}
    >
      {children}
    </div>
  );
}

/**
 * Grid cell inside the External-links dropdown. Renders the lucide
 * `ExternalLink` glyph + a label, opens in a new tab with `rel`
 * hardening. The label is truncated with a tooltip carrying the full
 * text so a long Wikipedia / Wikidata URL doesn't break the layout.
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
