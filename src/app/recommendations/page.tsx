import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Award,
  Compass,
  Eye,
  EyeOff,
  Gem,
  Heart,
  Lightbulb,
  ListChecks,
  Sparkles,
  Star,
  Tag as TagIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DEFAULT_RECOMMEND_MODE,
  parseRecommendMode,
  RECOMMEND_MODES,
  recommendVns,
  type Recommendation,
  type RecommendMode,
  type RecommendationSeed,
} from '@/lib/recommend';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';
import { CardDensitySlider } from '@/components/CardDensitySlider';
import { DensityScopeProvider } from '@/components/DensityScopeProvider';
import { SeedTagControls } from '@/components/SeedTagControls';
import { SkeletonCardGrid } from '@/components/Skeleton';
import { db } from '@/lib/db';
import type { Dictionary } from '@/lib/i18n/dictionaries';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.nav.recommend };
}

interface RecPageParams {
  ero?: string;
  tags?: string;
  mode?: string;
  seed?: string;
  owned?: string;
  wishlist?: string;
}

/**
 * Compact metadata for one mode tab: i18n keys + the Lucide icon
 * rendered in the tab strip. The five `RecommendMode` ids each have
 * one row so the strip iterates a single table instead of a five-arm
 * switch.
 */
const MODE_META: Record<
  RecommendMode,
  { icon: LucideIcon; i18nKey: 'becauseYouLiked' | 'tagBased' | 'hiddenGems' | 'highlyRated' | 'similarToVn' }
> = {
  'because-you-liked': { icon: Heart, i18nKey: 'becauseYouLiked' },
  'tag-based': { icon: TagIcon, i18nKey: 'tagBased' },
  'hidden-gems': { icon: Gem, i18nKey: 'hiddenGems' },
  'highly-rated': { icon: Award, i18nKey: 'highlyRated' },
  'similar-to-vn': { icon: Compass, i18nKey: 'similarToVn' },
};

/** Bool flags ride the URL as `=1`; anything else is "off". */
function isFlagOn(raw: string | undefined): boolean {
  return raw === '1';
}

/**
 * Rebuild the page URL with one or more params overridden. Used by the
 * mode tabs / filter toggles so each clickable surface stays a `<Link>`
 * (the page is server-rendered and we want shareable URLs, not
 * `router.push`).
 */
function buildHref(current: RecPageParams, overrides: Partial<RecPageParams>): string {
  const merged: RecPageParams = { ...current, ...overrides };
  const params = new URLSearchParams();
  if (merged.mode && merged.mode !== DEFAULT_RECOMMEND_MODE) params.set('mode', merged.mode);
  if (merged.tags) params.set('tags', merged.tags);
  if (merged.seed) params.set('seed', merged.seed);
  if (merged.ero === '1') params.set('ero', '1');
  if (merged.owned === '1') params.set('owned', '1');
  if (merged.wishlist === '1') params.set('wishlist', '1');
  const qs = params.toString();
  return qs ? `/recommendations?${qs}` : '/recommendations';
}

export default async function RecommendationsPage({
  searchParams,
}: {
  searchParams: Promise<RecPageParams>;
}) {
  const raw = await searchParams;
  const t = await getDict();
  const mode = parseRecommendMode(raw.mode);
  const includeEro = isFlagOn(raw.ero);
  const includeOwned = isFlagOn(raw.owned);
  const includeWishlist = isFlagOn(raw.wishlist);
  const seedVnId = raw.seed && /^(v\d+|egs_\d+)$/i.test(raw.seed)
    ? raw.seed.toLowerCase()
    : undefined;

  // `?tags=g123,g456` pins the seed list and bypasses auto-derivation.
  // Anything not matching `g\d+` is silently dropped so a tampered URL
  // can't blow up the recommender.
  const customTagIds = (raw.tags ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^g\d+$/i.test(s))
    .map((s) => s.toLowerCase());

  // The top-rated callout only makes sense for the modes that auto-derive
  // from the rating-weighted seed pool; tag-based / similar-to-vn anchor
  // somewhere else entirely.
  const topRated =
    mode === 'because-you-liked' || mode === 'hidden-gems' || mode === 'highly-rated'
      ? (db
          .prepare(`
            SELECT v.id, v.title
            FROM collection c JOIN vn v ON v.id = c.vn_id
            WHERE c.user_rating IS NOT NULL AND c.user_rating >= 70
            ORDER BY c.user_rating DESC, c.updated_at DESC
            LIMIT 3
          `)
          .all() as Array<{ id: string; title: string }>)
      : [];

  // Stable key for the inner <Suspense> so the skeleton actually shows
  // on every meaningful re-fetch (mode change, seed-set change, flag
  // toggle). Without this key, React would reuse the previous result
  // and skip the fallback.
  const fetchKey = [
    mode,
    customTagIds.join(','),
    seedVnId ?? '',
    includeEro ? '1' : '0',
    includeOwned ? '1' : '0',
    includeWishlist ? '1' : '0',
  ].join('|');

  return (
    <DensityScopeProvider scope="recommendations" className="mx-auto max-w-6xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" /> {t.nav.library}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <Sparkles className="h-6 w-6 text-accent" aria-hidden /> {t.recommend.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.recommend.subtitle}</p>

        <ModeTabs current={mode} currentParams={raw} t={t} />

        <ModeSummary
          mode={mode}
          topRated={topRated}
          seedVnId={seedVnId}
          t={t}
        />

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <FlagToggle
            on={includeEro}
            onHref={buildHref(raw, { ero: '1' })}
            offHref={buildHref(raw, { ero: undefined })}
            iconOn={Eye}
            iconOff={EyeOff}
            labelOn={t.recommend.eroIncluded}
            labelOff={t.recommend.eroExcluded}
            hintOn={t.recommend.eroIncludedHint}
            hintOff={t.recommend.eroExcludedHint}
            activeClass="border-status-dropped/60 bg-status-dropped/10 text-status-dropped hover:bg-status-dropped/20"
          />
          <FlagToggle
            on={includeOwned}
            onHref={buildHref(raw, { owned: '1' })}
            offHref={buildHref(raw, { owned: undefined })}
            iconOn={ListChecks}
            iconOff={ListChecks}
            labelOn={t.recommend.ownedIncluded}
            labelOff={t.recommend.ownedExcluded}
            hintOn={t.recommend.ownedIncludedHint}
            hintOff={t.recommend.ownedExcludedHint}
          />
          <FlagToggle
            on={includeWishlist}
            onHref={buildHref(raw, { wishlist: '1' })}
            offHref={buildHref(raw, { wishlist: undefined })}
            iconOn={Heart}
            iconOff={Heart}
            labelOn={t.recommend.wishlistIncluded}
            labelOff={t.recommend.wishlistExcluded}
            hintOn={t.recommend.wishlistIncludedHint}
            hintOff={t.recommend.wishlistExcludedHint}
          />
          <CardDensitySlider scope="recommendations" />
        </div>

        <SeedTagSlot
          mode={mode}
          seedVnId={seedVnId}
          customTagIds={customTagIds}
          includeEro={includeEro}
          includeOwned={includeOwned}
          includeWishlist={includeWishlist}
          t={t}
        />
      </header>

      <Suspense
        key={fetchKey}
        fallback={<SkeletonCardGrid count={12} />}
      >
        <ResultsPanel
          mode={mode}
          includeEro={includeEro}
          includeOwned={includeOwned}
          includeWishlist={includeWishlist}
          customTagIds={customTagIds}
          seedVnId={seedVnId}
          t={t}
        />
      </Suspense>
    </DensityScopeProvider>
  );
}

function ModeTabs({
  current,
  currentParams,
  t,
}: {
  current: RecommendMode;
  currentParams: RecPageParams;
  t: Dictionary;
}) {
  return (
    <nav
      className="mt-4 inline-flex flex-wrap gap-1 rounded-md border border-border bg-bg-elev/30 p-1 text-xs"
      role="tablist"
      aria-label={t.recommend.modePicker.label}
    >
      {RECOMMEND_MODES.map((id) => {
        const meta = MODE_META[id];
        const Icon = meta.icon;
        const active = id === current;
        const label = t.recommend.modes[meta.i18nKey].label;
        const hint = t.recommend.modes[meta.i18nKey].hint;
        // The mode tab clears any custom-pinned seeds so each tab gets
        // a clean run with the new mode's own default seed strategy.
        const href = buildHref(currentParams, { mode: id, tags: undefined });
        return (
          <Link
            key={id}
            href={href}
            role="tab"
            aria-selected={active}
            aria-current={active ? 'page' : undefined}
            title={hint}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${
              active ? 'bg-accent text-bg font-bold' : 'text-muted hover:text-white'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Per-mode "Why these recommendations?" panel. The copy differs by mode
 * because each one anchors the suggestions on different inputs (top
 * ratings, custom tags, low-vote pool, popular pool, single VN).
 */
function ModeSummary({
  mode,
  topRated,
  seedVnId,
  t,
}: {
  mode: RecommendMode;
  topRated: Array<{ id: string; title: string }>;
  seedVnId: string | undefined;
  t: Dictionary;
}) {
  const meta = MODE_META[mode];
  const why = t.recommend.modes[meta.i18nKey].why;

  return (
    <div className="mt-4 rounded-lg border border-border bg-bg-elev/30 p-3">
      <h2 className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        <Lightbulb className="h-3.5 w-3.5 text-accent" aria-hidden />
        {t.recommend.whyTitle}
      </h2>
      <p className="text-[12px] text-muted">{why}</p>
      {(mode === 'because-you-liked' || mode === 'hidden-gems' || mode === 'highly-rated') &&
        topRated.length > 0 && (
          <p className="mt-1 text-[12px] text-muted">
            {t.recommend.whyBasedOn}{' '}
            {topRated.map((v, i, arr) => (
              <span key={v.id}>
                <Link href={`/vn/${v.id}`} className="font-semibold text-white hover:text-accent">
                  {v.title}
                </Link>
                {i < arr.length - 1 ? (i === arr.length - 2 ? ` ${t.recommend.whyAnd} ` : ', ') : ''}
              </span>
            ))}
            {'.'}
          </p>
        )}
      {mode === 'similar-to-vn' && !seedVnId && (
        <p className="mt-2 rounded border border-status-on_hold/40 bg-status-on_hold/10 p-2 text-[11px] text-status-on_hold">
          {t.recommend.modes.similarToVn.needsSeed}
        </p>
      )}
    </div>
  );
}

/**
 * Toggle wrapper for the include/exclude chips on the toolbar. Each
 * one is a `<Link>` to keep the URL shareable; both states render the
 * same affordance, only the `aria-pressed` + colour changes.
 */
function FlagToggle({
  on,
  onHref,
  offHref,
  iconOn: IconOn,
  iconOff: IconOff,
  labelOn,
  labelOff,
  hintOn,
  hintOff,
  activeClass = 'border-accent/50 bg-accent/10 text-accent hover:bg-accent/20',
}: {
  on: boolean;
  onHref: string;
  offHref: string;
  iconOn: LucideIcon;
  iconOff: LucideIcon;
  labelOn: string;
  labelOff: string;
  hintOn: string;
  hintOff: string;
  activeClass?: string;
}) {
  const Icon = on ? IconOn : IconOff;
  return (
    <Link
      href={on ? offHref : onHref}
      aria-pressed={on}
      title={on ? hintOn : hintOff}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 transition-colors ${
        on ? activeClass : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-white'
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {on ? labelOn : labelOff}
    </Link>
  );
}

/**
 * Render the seed-tag picker. Kept in its own Suspense-friendly slot
 * so the picker UI can paint immediately on tab changes even while the
 * result grid is still loading. We compute lightweight initial chip
 * data here so the picker doesn't need to round-trip to the server for
 * names that are already known.
 */
async function SeedTagSlot({
  mode,
  seedVnId,
  customTagIds,
  includeEro,
  includeOwned,
  includeWishlist,
  t,
}: {
  mode: RecommendMode;
  seedVnId: string | undefined;
  customTagIds: string[];
  includeEro: boolean;
  includeOwned: boolean;
  includeWishlist: boolean;
  t: Dictionary;
}) {
  // Pull seeds without firing the upstream search so the picker has
  // chip names to render even while the heavy `ResultsPanel` is still
  // streaming. `resultLimit: 0` short-circuits the per-seed VNDB calls.
  let seeds: RecommendationSeed[] = [];
  try {
    const r = await recommendVns({
      mode,
      includeEro,
      includeOwned,
      includeWishlist,
      customTagIds: customTagIds.length > 0 ? customTagIds : undefined,
      seedVnId,
      resultLimit: 0,
    });
    seeds = r.seeds;
  } catch {
    seeds = [];
  }
  const usingCustomSeeds = customTagIds.length > 0;
  const preserveParams = [
    'ero',
    'owned',
    'wishlist',
    'mode',
    ...(mode === 'similar-to-vn' ? ['seed'] : []),
  ];
  return (
    <div className="mt-3">
      <SeedTagControls
        initial={seeds.map((s) => ({ id: s.tagId, name: s.name, weight: s.weight }))}
        paramName="tags"
        preserveParams={preserveParams}
        label={t.recommend.seedsLabel}
        hint={usingCustomSeeds ? t.recommend.seedsHintCustom : t.recommend.seedsHint}
      />
    </div>
  );
}

async function ResultsPanel({
  mode,
  includeEro,
  includeOwned,
  includeWishlist,
  customTagIds,
  seedVnId,
  t,
}: {
  mode: RecommendMode;
  includeEro: boolean;
  includeOwned: boolean;
  includeWishlist: boolean;
  customTagIds: string[];
  seedVnId: string | undefined;
  t: Dictionary;
}) {
  let seeds: RecommendationSeed[] = [];
  let results: Recommendation[] = [];
  let error: string | null = null;
  try {
    const r = await recommendVns({
      mode,
      includeEro,
      includeOwned,
      includeWishlist,
      customTagIds: customTagIds.length > 0 ? customTagIds : undefined,
      seedVnId,
    });
    seeds = r.seeds;
    results = r.results;
  } catch (e) {
    error = (e as Error).message;
  }

  if (error) {
    return (
      <div className="mb-4 rounded-lg border border-status-dropped/40 bg-status-dropped/10 p-4 text-sm text-status-dropped">
        {error}
      </div>
    );
  }

  if (mode === 'similar-to-vn' && !seedVnId) {
    return (
      <p className="rounded-xl border border-border bg-bg-card p-4 sm:p-6 text-sm text-muted">
        {t.recommend.modes.similarToVn.needsSeed}
      </p>
    );
  }

  if (seeds.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-bg-card p-4 sm:p-6 text-sm text-muted">
        {t.recommend.empty}
      </p>
    );
  }

  if (results.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-bg-card p-4 sm:p-6 text-sm text-muted">
        {t.recommend.empty}
      </p>
    );
  }

  return <ResultsGrid mode={mode} results={results} t={t} />;
}

function ResultsGrid({
  mode,
  results,
  t,
}: {
  mode: RecommendMode;
  results: Recommendation[];
  t: Dictionary;
}) {
  return (
    <ul
      className="grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
    >
      {results.map((r) => {
        const year = r.released?.slice(0, 4);
        const rating = r.rating != null ? (r.rating / 10).toFixed(1) : null;
        const ratingForReason = r.rating != null ? (r.rating / 10).toFixed(1) : '—';
        const votesForReason = r.votecount != null ? r.votecount.toLocaleString() : '—';
        // Dedup matched tags before slicing so two seeds that both
        // matched the same tag don't double up.
        const seenTagIds = new Set<string>();
        const uniqueMatched = r.matchedTags.filter((mt) => {
          if (seenTagIds.has(mt.id)) return false;
          seenTagIds.add(mt.id);
          return true;
        });
        const reason = renderReason(mode, uniqueMatched.length, ratingForReason, votesForReason, t);
        return (
          <li key={r.id}>
            <Link
              href={`/vn/${r.id}`}
              className="group flex flex-col gap-2 rounded-xl border border-border bg-bg-card p-3 transition-colors hover:border-accent"
            >
              <div className="relative">
                <SafeImage
                  src={r.image?.thumbnail || r.image?.url || null}
                  sexual={r.image?.sexual ?? null}
                  alt={r.title}
                  className="aspect-[2/3] w-full rounded-lg"
                />
                {rating && (
                  <div className="absolute right-1 top-1 rounded bg-bg-card/90 px-1.5 py-0.5 text-[10px] font-bold text-accent shadow-card backdrop-blur">
                    <Star className="mr-0.5 inline h-2.5 w-2.5 fill-accent" aria-hidden /> {rating}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h3 className="line-clamp-2 text-sm font-bold transition-colors group-hover:text-accent">
                  {r.title}
                </h3>
                {reason && (
                  <p className="mt-0.5 text-[10px] text-accent/80">{reason}</p>
                )}
                {r.developers[0]?.name && (
                  <p className="line-clamp-1 text-[11px] text-muted">{r.developers[0].name}</p>
                )}
                {year && <p className="mt-0.5 text-[10px] text-muted">{year}</p>}
                {uniqueMatched.length > 0 && (
                  <div className="mt-1.5">
                    <p className="text-[9px] uppercase tracking-wider text-muted/80">
                      {t.recommend.whyCardLabel}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-0.5">
                      {/* Only the human-readable tag name shows — the
                          raw `gNNN` id stays in `title` for power users
                          + automation. Matches the picker convention. */}
                      {uniqueMatched.slice(0, 4).map((mt) => (
                        <span
                          key={mt.id}
                          title={mt.id}
                          className="rounded bg-bg-elev/60 px-1 py-0.5 text-[9px] text-muted"
                        >
                          {mt.name}
                        </span>
                      ))}
                      {uniqueMatched.length > 4 && (
                        <span className="text-[9px] text-muted opacity-60">
                          +{uniqueMatched.length - 4}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function renderReason(
  mode: RecommendMode,
  matchedCount: number,
  ratingForReason: string,
  votesForReason: string,
  t: Dictionary,
): string | null {
  const reasons = t.recommend.cardReason;
  switch (mode) {
    case 'because-you-liked':
      return matchedCount > 0 ? reasons.becauseYouLiked.replace('{n}', String(matchedCount)) : null;
    case 'tag-based':
      return matchedCount > 0 ? reasons.tagBased.replace('{n}', String(matchedCount)) : null;
    case 'hidden-gems':
      return reasons.hiddenGems
        .replace('{votes}', votesForReason)
        .replace('{rating}', ratingForReason);
    case 'highly-rated':
      return reasons.highlyRated
        .replace('{votes}', votesForReason)
        .replace('{rating}', ratingForReason);
    case 'similar-to-vn':
      return matchedCount > 0 ? reasons.similarToVn.replace('{n}', String(matchedCount)) : null;
    default:
      return null;
  }
}
