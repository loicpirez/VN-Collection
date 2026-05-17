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
 * Detail-page action toolbar — second acceptance-gate rework.
 *
 * The previous regroup left the rendered page as a button wall: a flat
 * row of mismatched buttons, a "Refresh/Sync" cluster label that
 * spoke about transport instead of intent, and a Tracking cluster
 * that lumped unrelated controls together. The new contract is six
 * explicit groups, with the inline cluster strictly limited to four
 * primary tracking affordances:
 *
 *   1. groupCollection  — favorite, wishlist heart, queue, lists,
 *                          plus the status pill / add button inline;
 *                          remove sits right-anchored as btn-danger.
 *                          AnimeChip stays as inline informational.
 *   2. groupTracking    — series picker, notes editor entry,
 *                          follow-up status, owned editions.
 *   3. groupExternal    — VNDB / EGS / Wikipedia / Wikidata /
 *                          MobyGames / IGDB / GameFAQs / VGMdb /
 *                          ACDB / HowLongToBeat, rendered as a 2-col
 *                          icon grid INSIDE a single dropdown so the
 *                          flat 10-icon row never appears.
 *   4. groupMedia       — cover source, banner source, crop.
 *   5. groupData        — download missing / re-download all, refresh
 *                          releases, refresh release-metadata,
 *                          refresh images, refresh EGS↔VNDB mapping.
 *   6. groupMapping     — compare, map EGS / map VNDB, migrate id.
 *
 * The bar surfaces:
 *   - Exactly 4 inline primary <button>s (favorite, wishlist, queue,
 *     lists). The status pill / AnimeChip are spans, not buttons.
 *   - Exactly 5 <ActionMenu> dropdown triggers (Tracking, External,
 *     Media, Data, Mapping). groupCollection is inline-only.
 *   - Exactly 1 right-anchored <button class="btn-danger"> (Remove).
 *
 * Each cluster keeps its `role="group"` so screen readers still
 * announce the grouping.
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
  // Every external link folds into the dropdown; the flat 10-icon
  // row was the loudest button-wall offender on the rendered page.
  const extlinks = vn.extlinks ?? [];
  const hasExtlinks = extlinks.length > 0;
  const showExternalMenu = !isEgsOnly || hasExtlinks || !!egsRow?.egs_id;

  // ── Cluster 1: Collection (inline only — NO dropdown) ────────────
  // Four primary inline buttons (favorite, wishlist heart, queue,
  // lists) sit above the cluster row. The status pill is a passive
  // <AnimeChip>; the Add button is rendered inline only when the VN
  // is missing from the collection — otherwise the row stays at the
  // four primary buttons. Remove lives in the right-anchored danger
  // cluster below so the destructive action is visually separated.
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
      {inCollection && <AnimeChip vnId={vn.id} />}
    </ActionGroup>
  );

  // ── Cluster 2: Tracking (single dropdown) ────────────────────────
  // The actual notes / series / owned-editions editors render
  // further down the VN page (inside `<EditForm>`, `<SeriesAutoSuggest>`,
  // `<OwnedEditionsSection>`). The dropdown surfaces anchor links to
  // those sections so a user landing on the bar can jump straight to
  // the editor without scrolling — every link uses a fragment anchor
  // that the receiving section reads via `id="…"`.
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
      <div className="flex flex-col gap-0.5" role="group" aria-label={t.detail.actions.groupTracking}>
        <TrackingAnchor href="#section-series" label={t.detail.seriesSection} />
        <TrackingAnchor href="#section-edit" label={t.form.myTracking} />
        <TrackingAnchor href="#section-notes" label={t.form.personalNotes} />
        <TrackingAnchor href="#section-owned" label={t.inventory.section} />
      </div>
    </ActionMenu>
  ) : null;

  // ── Cluster 3: External links (single dropdown) ─────────────────
  // The trigger sits inline; the menu body is a 2-column icon grid
  // with the lucide `ExternalLink` glyph plus the label. VNDB / EGS
  // sit at the top so they're the most prominent options; every
  // VNDB-reported extlink is appended below.
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

  // ── Cluster 4: Media (single dropdown) ──────────────────────────
  // Both source pickers open their own dialogs. Folding them inside
  // a dropdown keeps the inline row at four primaries.
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
      <div className="flex flex-col gap-1" role="group" aria-label={t.detail.actions.groupMedia}>
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
  // Data + metadata actions are intentionally NOT gated on collection
  // membership. The operator can open `/vn/<id>` from an EGS top-
  // ranked link, a search hit, or an anticipated row — they STILL
  // need to refresh the VNDB metadata cache, re-mirror images, and
  // re-materialise `release_meta_cache`. The route
  // `POST /api/collection/[id]/assets` was relaxed in tandem so it
  // operates on the `vn` table (per-VN cache), not on `collection`
  // (per-tracking-row). Synthetic `egs_*` ids still skip the menu —
  // there's no VNDB metadata to refresh on a synthetic row.
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
      <DownloadAssetsButton vnId={vn.id} />
    </ActionMenu>
  ) : null;

  // ── Cluster 6: Mapping (single dropdown) ────────────────────────
  // Compare + map EGS/VNDB + the heavyweight id migration all open
  // large modals, so a single dropdown trigger keeps them out of
  // the inline row.
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
      <div className="flex flex-col gap-1" role="group" aria-label={t.detail.actions.groupMapping}>
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

  // ── Destructive (rendered last, pushed right) ────────────────────
  const dangerous = inCollection ? (
    <ActionGroup label={t.detail.actions.groupDangerous} tone="danger">
      <CoverQuickActions vnId={vn.id} inCollection={inCollection} mode="danger" />
    </ActionGroup>
  ) : null;

  // Build the linear list, skipping empty clusters so we never render
  // a stray separator.
  const blocks = [collection, tracking, external, media, data, mapping, dangerous].filter(
    Boolean,
  );

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
 * Single action cluster shell. The `tone='danger'` variant pushes
 * the cluster right-aligned on `md+` so the destructive Remove
 * button sits visually apart from the tracking primaries.
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
