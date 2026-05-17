import { Download, ExternalLink } from 'lucide-react';
import type { CollectionItem, ReleaseImage, Screenshot } from '@/lib/types';
import { getDict } from '@/lib/i18n/server';
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
 * Six-cluster action toolbar for the VN detail page.
 *
 * The flat row of mixed-concern buttons (download, refresh, edit, cover,
 * banner, remove, lists, queue, favorite, …) used to render as a single
 * `flex-wrap` blob — the manual QA review flagged that the visual
 * clutter made it impossible to scan. This wrapper groups every
 * existing button into 6 labeled clusters separated by a thin vertical
 * divider, without removing any functionality.
 *
 *   1. Tracking      — favorite / wishlist heart / informational chips
 *   2. Inventory     — reading queue + user lists
 *   3. Media         — cover & banner source pickers
 *   4. Refresh/Sync  — assets re-download + every external resource link
 *                      (VNDB / EGS / extlinks / EGS-to-VNDB migration)
 *   5. Activity      — comparison & launch (download URL anchor)
 *   6. Dangerous     — Remove from collection, styled as `btn-danger`
 *
 * Groups whose conditional content is empty (e.g. Dangerous when the
 * VN isn't in the collection, or Refresh when there are no external
 * links and no assets button) collapse entirely so we don't render
 * stray separators.
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
  // Each group renders as a fragment so we can short-circuit empty
  // groups without leaving an orphan separator behind. The `groups`
  // array collects only the non-empty ones and the renderer below
  // intersperses the dividers.
  const screenshots: Screenshot[] = vn.screenshots ?? [];
  const releaseImages: ReleaseImage[] = vn.release_images ?? [];
  const extlinks = (vn.extlinks ?? []).slice(0, 8);
  const hasDownloadUrl = inCollection && !!vn.download_url;

  const tracking = (
    <ActionGroup label={t.detail.actions.groupTracking}>
      {inCollection && (
        <FavoriteToggleButton
          vnId={vn.id}
          initial={!!vn.favorite}
          inCollection
          variant="inline"
        />
      )}
      <CoverQuickActions vnId={vn.id} inCollection={inCollection} mode="tracking" />
      {inCollection && <AnimeChip vnId={vn.id} />}
    </ActionGroup>
  );

  // Inventory only makes sense once the VN is tracked locally; the
  // reading-queue endpoint requires a `collection` row and the lists
  // popover is only meaningful for owned VNs.
  const inventory = inCollection ? (
    <ActionGroup label={t.detail.actions.groupInventory}>
      <QueueButton vnId={vn.id} />
      <ListsPickerButton vnId={vn.id} variant="inline" />
    </ActionGroup>
  ) : (
    // Lists picker can still attach a wishlisted VN to user-curated lists
    // without an explicit collection row, so we surface it here too.
    <ActionGroup label={t.detail.actions.groupInventory}>
      <ListsPickerButton vnId={vn.id} variant="inline" />
    </ActionGroup>
  );

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

  // Refresh/sync bundles every "talk to upstream / external resources"
  // affordance: explicit re-download, the VNDB / EGS detail pages, the
  // optional EGS-to-VNDB id migration, plus the raw extlinks list.
  const sync = (
    <ActionGroup label={t.detail.actions.groupSync}>
      {inCollection && <DownloadAssetsButton vnId={vn.id} />}
      {!isEgsOnly && (
        <a
          href={`https://vndb.org/${vn.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn"
        >
          <ExternalLink className="h-4 w-4" /> {t.detail.viewOnVndb}
        </a>
      )}
      {egsRow?.egs_id && (
        <a
          href={`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${egsRow.egs_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn"
        >
          <ExternalLink className="h-4 w-4" /> {t.detail.viewOnEgs}
        </a>
      )}
      {isEgsOnly && (
        <LinkToVndbButton vnId={vn.id} seedQuery={vn.alttitle?.trim() || vn.title} />
      )}
      {extlinks.map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
          title={l.label}
        >
          <ExternalLink className="h-3 w-3" /> {l.label}
        </a>
      ))}
    </ActionGroup>
  );

  // Activity covers analysis & launch — comparing this VN against
  // others, plus the "open my own download" shortcut.
  const activity = (
    <ActionGroup label={t.detail.actions.groupActivity}>
      <CompareWithButton currentVnId={vn.id} />
      {hasDownloadUrl && (
        <a
          href={vn.download_url ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
          title={vn.download_url ?? undefined}
        >
          <Download className="h-4 w-4" /> {t.form.downloadOpen}
        </a>
      )}
    </ActionGroup>
  );

  // Dangerous is rendered last (rightmost on wide screens) and houses
  // ONLY the destructive Remove button. Hidden entirely until the VN is
  // in the collection — there's nothing to destroy otherwise.
  const dangerous = inCollection ? (
    <ActionGroup label={t.detail.actions.groupDangerous} tone="danger">
      <CoverQuickActions vnId={vn.id} inCollection={inCollection} mode="danger" />
    </ActionGroup>
  ) : null;

  const groups = [tracking, inventory, media, sync, activity, dangerous].filter(Boolean);

  return (
    <nav
      aria-label={t.detail.actions.ariaLabel}
      className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2"
    >
      {groups.map((g, i) => (
        <div key={i} className="contents">
          {g}
          {i < groups.length - 1 && (
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
 * Single action cluster. Tags the wrapping `<div>` as a labeled
 * region (`role="group"` + `aria-label`) so screen readers can
 * announce the cluster's intent. The visible label itself is
 * intentionally omitted from the layout — the action verbs in each
 * button stay the primary signal; the visual separator + the aria
 * label are enough to convey grouping without doubling the row
 * height with redundant section headings.
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
