/** Deterministic offer classification for VN stock results. No I/O. */

export type ContentKind =
  | 'game_package'
  | 'digital_download'
  | 'store_bonus_bundle'
  | 'bonus_only'
  | 'related_goods'
  | 'soundtrack'
  | 'artbook'
  | 'figure'
  | 'novel'
  | 'unknown';

export type Platform = 'PC' | 'Switch' | 'PS4' | 'PS5' | 'PSVita' | 'other' | 'unknown';

export type EditionKind =
  | 'standard'
  | 'limited'
  | 'first_press'
  | 'deluxe'
  | 'luxury'
  | 'complete_pack'
  | 'multi_pack'
  | 'store_exclusive'
  | 'used_rank_b'
  | 'bonus_only'
  | 'budget'
  | 'download'
  | 'unknown';

export type SeriesRelation =
  | 'exact_game'
  | 'same_game_different_platform'
  | 'same_game_different_edition'
  | 'same_series_previous_game'
  | 'sequel_or_pack'
  | 'related_goods'
  | 'unrelated';

export type MatchConfidence = 'exact' | 'high' | 'medium' | 'low' | 'reject';

export interface OfferClassification {
  contentKind: ContentKind;
  platform: Platform;
  editionKind: EditionKind;
  seriesRelation: SeriesRelation;
  matchConfidence: MatchConfidence;
  matchScore: number;
  matchWarnings: string[];
}

export interface ClassifyTarget {
  title: string;
  altTitles?: string[];
  aliases?: string[];
  platforms?: string[];
}

const GOODS_CATEGORIES: ReadonlySet<string> = new Set([
  'タペストリー',
  'アクリルスタンド',
  'アクリルパネル',
  'アクリルスタンド・アクリルパネル',
  'キーホルダー',
  '紙製品',
  'ポスター',
  '雑貨',
  'キャンバスボード',
  'バッジ',
  'ピンズ',
  'タオル',
  'ブロマイド',
  'クリアファイル',
  '色紙',
  '特典',
  'グッズ',
]);

const GOODS_CATEGORY_PATTERNS: ReadonlyArray<RegExp> = [
  /タペストリー/,
  /アクリル/,
  /フィギュア|figure/i,
  /キーホルダー/,
  /ポスター|poster/i,
  /雑貨/,
  /バッジ|ピンズ/,
  /タオル/,
  /ブロマイド/,
  /クリアファイル/,
  /色紙/,
  /グッズ/,
];

const FIGURE_CATEGORY_PATTERNS: ReadonlyArray<RegExp> = [/フィギュア|figure/i, /ドール|人形/];

const SOUNDTRACK_CATEGORY_PATTERNS: ReadonlyArray<RegExp> = [/サウンドトラック|soundtrack|音楽CD|ゲームCD/i];

const ARTBOOK_CATEGORY_PATTERNS: ReadonlyArray<RegExp> = [/画集|アートブック|artbook/i, /設定資料集/];

// Light-novel / novel adaptations of a VN. User-flagged regression:
// `【小説】沙耶の唄` was reaching the offer list as if it were the
// game. Detect the bracketed `【小説】` / `【ノベル】` prefix plus the
// loose "ノベライズ" / "novelization" / "小説版" suffix variants so the
// row drops to `content_kind=novel` (heavy penalty, same shape as
// related-goods).
const NOVEL_TITLE_PATTERNS: ReadonlyArray<RegExp> = [
  /[【「『]\s*(?:小説|ノベル|ノベライズ|novelization)\s*[】」』]/i,
  /(?:^|\s)(?:小説版|ノベル版|ノベライズ|novelization)(?:\s|$)/i,
  // Bracket-less leading "【novel】" / "【ライトノベル】" with English text.
  /[【「『]\s*(?:novel|light\s*novel|ライトノベル)\s*[】」』]/i,
];

const SOUNDTRACK_TITLE_PATTERNS: ReadonlyArray<RegExp> = [
  /MP3\s*ダウンロード|Amazon\s*Music/i,
  /(?:^|[\s【「『])CD(?:[\s】」』]|$)/i,
  /サウンドトラック|soundtrack/i,
  /主題歌|楽曲|song|songs/i,
  /ミニ(?:ソング)?アルバム|album/i,
  /ラジオ|radio/i,
  /off\s*vocal|オフボーカル/i,
  /live\s*(?:ver\.?|version|medley)?|ライブ(?:版|メドレー)?/i,
];

const RELATED_GOODS_TITLE_PATTERNS: ReadonlyArray<RegExp> = [
  /フィギュア|figure|ホビー|hobby/i,
  /アクリル|タペストリー|抱き枕|キーホルダー|バッジ|クリアファイル|色紙|グッズ/,
  // Strategy guides / fan books — same title as the VN but a separate
  // companion publication. Classify as related goods so they don't count
  // as game offers.
  /攻略ガイド|攻略本|ガイドブック|コンプリート(?:ガイド|ブック|集)|公式ガイド|ファンブック|資料集/,
  // Bundled compilation series + bundled-strategy-guide titles (any title
  // that says "ヌキコレ vol.NN" or "<game name> 完全攻略ガイド付" is a
  // compilation that includes a guide, not the standalone game).
  /ヌキコレ\s*vol\.|完全攻略ガイド\s*付/i,
];

const SOFTWARE_CATEGORIES: ReadonlySet<string> = new Set([
  'PCソフト',
  'Windows',
  'ニンテンドースイッチソフト',
  'Nintendo Switch',
  'Switchソフト',
  'PS4ソフト',
  'PS5ソフト',
  'PSVITAソフト',
  'PSVitaソフト',
  'ゲームソフト',
  'ゲーム',
  'パッケージ版',
]);

const SOFTWARE_CATEGORY_PATTERNS: ReadonlyArray<RegExp> = [
  /PCソフト|パソコン用ソフト|Windows(ソフト)?/i,
  /ニンテンドースイッチ|Switchソフト/,
  /PS[45]ソフト|PlayStation\s*[45]/i,
  /PSVita|PSVITA/i,
  /ゲームソフト|ゲームパッケージ/,
];

function isGoodsCategory(category: string): boolean {
  if (!category) return false;
  if (GOODS_CATEGORIES.has(category)) return true;
  return GOODS_CATEGORY_PATTERNS.some((re) => re.test(category));
}

function isSoftwareCategory(category: string): boolean {
  if (!category) return false;
  if (SOFTWARE_CATEGORIES.has(category)) return true;
  return SOFTWARE_CATEGORY_PATTERNS.some((re) => re.test(category));
}

function isFigureCategory(category: string): boolean {
  return FIGURE_CATEGORY_PATTERNS.some((re) => re.test(category));
}

function isSoundtrackCategory(category: string): boolean {
  return SOUNDTRACK_CATEGORY_PATTERNS.some((re) => re.test(category));
}

function isArtbookCategory(category: string): boolean {
  return ARTBOOK_CATEGORY_PATTERNS.some((re) => re.test(category));
}

function isSoundtrackTitle(title: string): boolean {
  return SOUNDTRACK_TITLE_PATTERNS.some((re) => re.test(title));
}

function isRelatedGoodsTitle(title: string): boolean {
  return RELATED_GOODS_TITLE_PATTERNS.some((re) => re.test(title));
}

function isNovelTitle(title: string): boolean {
  return NOVEL_TITLE_PATTERNS.some((re) => re.test(title));
}

/** Detect a `Platform` from a shop's category label. Falls back to `'unknown'`. */
export function platformFromCategory(category: string): Platform {
  if (!category) return 'unknown';
  if (/ニンテンドースイッチ|Switch/i.test(category)) return 'Switch';
  if (/PS5|PlayStation\s*5/i.test(category)) return 'PS5';
  if (/PS4|PlayStation\s*4/i.test(category)) return 'PS4';
  if (/PSVita|PSVITA/i.test(category)) return 'PSVita';
  if (/PCソフト|Windows|パソコン|エロゲ/i.test(category)) return 'PC';
  return 'unknown';
}

/** Fallback `Platform` detection when no category is available, scanning the title. */
export function platformFromTitle(title: string): Platform {
  if (/Switch|スイッチ|ニンテンドースイッチ/i.test(title)) return 'Switch';
  if (/PS5|PlayStation\s*5/i.test(title)) return 'PS5';
  if (/PS4|PlayStation\s*4/i.test(title)) return 'PS4';
  if (/PSVita|PS\s*Vita/i.test(title)) return 'PSVita';
  if (/PCソフト|for Windows/i.test(title)) return 'PC';
  return 'unknown';
}

/** Detect the edition kind (初回限定版, 通常版, …) from a shop-listing title. */
export function editionFromTitle(title: string): EditionKind {
  if (/廉価版|廉価セット|廉価DVD|プライスダウン|プライス・?ダウン|お買得版|お買い得版|ベスト版|ベストプライス|プリティ?プライス|EZシリーズ|Best Hit/i.test(title)) return 'budget';
  if (/ダウンロード版|DL版|DLsite|FANZA|DiGiket|ダウンロードカード/i.test(title)) return 'download';
  if (/通常版/.test(title)) return 'standard';
  if (/初回限定版|初回版/.test(title)) return 'first_press';
  if (/完全生産限定版|完全限定版/.test(title)) return 'limited';
  if (/限定版/.test(title)) return 'limited';
  if (/豪華版|デラックス版?/.test(title)) return 'deluxe';
  if (/完全版/.test(title)) return 'complete_pack';
  if (/[0-9０-９・]+パック|セット/.test(title)) return 'multi_pack';
  if (/ランクB/.test(title)) return 'used_rank_b';
  return 'unknown';
}

/**
 * Lowercase, fold full-width punctuation to half-width, strip brackets and
 * collapse whitespace. Used by classifier matching so visual differences
 * (e.g. 【 vs [ ) don't break similarity scoring.
 */
export function normalizeTitle(title: string): string {
  return title
    .replace(/\s+/g, ' ')
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[　]/g, ' ')
    .replace(/[【】「」『』（）()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Returns true if result title has the same base name as target but a different series number.
 * e.g. target = "サンプル3", result = "サンプル2" → true
 * e.g. target = "サンプル3", result = "サンプル3Cute" → false
 */
export function seriesNumberMismatch(resultTitle: string, targetTitle: string): boolean {
  const targetNumMatch = /([^\d])(\d+)/.exec(targetTitle);
  if (!targetNumMatch) return false;
  const targetNum = targetNumMatch[2];
  const targetBase = targetTitle.slice(0, targetNumMatch.index + 1).trim();
  if (targetBase.length < 2) return false;
  if (!resultTitle.includes(targetBase)) return false;
  const baseIdx = resultTitle.indexOf(targetBase);
  const afterBase = resultTitle.slice(baseIdx + targetBase.length);
  const resultNumMatch = /^(\d+)/.exec(afterBase.trimStart());
  if (!resultNumMatch) return false;
  return resultNumMatch[1] !== targetNum;
}

export interface ClassifyOfferOptions {
  /** Provenance of this offer: a result reached via a direct VNDB-release
   * extlink, a user-pasted manual source, or a JAN-direct URL is trusted
   * much more than a broad title-search hit. Pass 'direct' or 'manual'
   * to apply the trust boost; default 'search' keeps the old scoring. */
  source?: 'direct' | 'manual' | 'search' | 'cached';
  /** Hint provider for cases where the category cannot be detected from
   * the page (e.g. PC Shop Unoya is PC-only by definition). Lets the
   * classifier resolve content_kind / platform without relying on the
   * scraped category string. */
  provider?: string | null;
}

/**
 * Classify a single offer result against a target VN.
 * Pure function: deterministic, no I/O.
 */
export function classifyOffer(
  title: string,
  category: string | null | undefined,
  target: ClassifyTarget,
  options: ClassifyOfferOptions = {},
): OfferClassification {
  const warnings: string[] = [];
  let score = 0;
  const cat = (category ?? '').trim();
  const source = options.source ?? 'search';
  const provider = options.provider ?? null;
  // Providers that exclusively sell PC visual-novel software — the
  // listing is implicitly a game package even when the scraped row
  // carries no category string. Without this, every Hgame1 / PC Shop
  // Unoya result was scored as content_kind=unknown and never reached
  // the +50 exact-match bucket.
  const PC_SOFTWARE_PROVIDERS = new Set([
    'hgame1', 'sofmap', 'getchu', 'gamers', 'ebten', 'animate',
    'melonbooks', 'gamecity',
  ]);

  // ── Step 1: content kind ───────────────────────────────────────────────────
  const isBonusPrefix = /^\s*\[単品\]/.test(title);
  const goodsCat = isGoodsCategory(cat);
  const softwareCat = isSoftwareCategory(cat);
  const soundtrackTitle = isSoundtrackTitle(title);
  const relatedGoodsTitle = isRelatedGoodsTitle(title);
  const novelTitle = isNovelTitle(title);

  let contentKind: ContentKind;
  if (novelTitle) {
    // Light-novel / novel adaptation. User-reported: `【小説】沙耶の唄`
    // was leaking through as a normal result. Heavier penalty than
    // artbook because the title overlap with the VN is exact and
    // would otherwise rank high.
    contentKind = 'novel';
    score -= 55;
    warnings.push('novel_title');
  } else if (isBonusPrefix) {
    contentKind = 'bonus_only';
    score -= 60;
    // I-007: emit stable slug keys (translated at render time) rather
    // than English literals — the same string lands in the DB via
    // `vn_stock_offer.match_warnings_json` and would otherwise show as
    // raw English to FR/JA users. Legacy rows that still carry the old
    // English wording are mapped back to slugs in `stockWarningLabel`.
    warnings.push('bonus_only_item');
  } else if (soundtrackTitle) {
    contentKind = 'soundtrack';
    score -= 60;
    warnings.push('related_music_media');
  } else if (relatedGoodsTitle) {
    contentKind = /フィギュア|figure/i.test(title) ? 'figure' : 'related_goods';
    score -= 55;
    warnings.push('related_goods_title');
  } else if (isFigureCategory(cat)) {
    contentKind = 'figure';
    score -= 50;
    warnings.push('related_goods_category');
  } else if (isSoundtrackCategory(cat)) {
    contentKind = 'soundtrack';
    score -= 40;
    warnings.push('related_goods_category');
  } else if (isArtbookCategory(cat)) {
    contentKind = 'artbook';
    score -= 40;
    warnings.push('related_goods_category');
  } else if (goodsCat) {
    contentKind = 'related_goods';
    score -= 50;
    warnings.push('related_goods_category');
  } else if (softwareCat) {
    contentKind = 'game_package';
    score += 40;
  } else if (provider && PC_SOFTWARE_PROVIDERS.has(provider)) {
    // Hgame1 / Sofmap / Getchu / Gamers / ebten / Animate / Melonbooks /
    // GAMECITY sell PC visual-novel software exclusively (the few
    // related-goods rows are already filtered by goods/soundtrack title
    // patterns above). Treat the listing as a game package.
    contentKind = 'game_package';
    score += 30;
  } else {
    contentKind = 'unknown';
  }

  // ── Step 2: platform ──────────────────────────────────────────────────────
  let platform = platformFromCategory(cat);
  if (platform === 'unknown') platform = platformFromTitle(title);

  if (platform !== 'unknown') {
    score += 10;
    if (target.platforms && target.platforms.length > 0) {
      const normalPlatform = platform.toLowerCase();
      if (target.platforms.some((p) => p.toLowerCase().includes(normalPlatform) || normalPlatform.includes(p.toLowerCase()))) {
        score += 15;
      }
    }
  }

  // ── Step 3: edition ───────────────────────────────────────────────────────
  const editionKind = editionFromTitle(title);
  if (editionKind !== 'unknown') score += 10;

  // ── Step 4: title matching ────────────────────────────────────────────────
  const normTitle = normalizeTitle(title);
  const allTargetTitles = [target.title, ...(target.altTitles ?? []), ...(target.aliases ?? [])];
  const normTargets = allTargetTitles.map(normalizeTitle);

  const containsTarget = normTargets.some((nt) => normTitle.includes(nt));
  const numMismatch = seriesNumberMismatch(title, target.title);

  let seriesRelation: SeriesRelation;

  if (goodsCat || isBonusPrefix || contentKind === 'figure' || contentKind === 'soundtrack' || contentKind === 'artbook' || relatedGoodsTitle || soundtrackTitle) {
    seriesRelation = 'related_goods';
    if (containsTarget) {
      score -= 30;
      warnings.push('only_mentions_target_in_bonus');
    }
  } else if (numMismatch) {
    seriesRelation = 'same_series_previous_game';
    score -= 40;
    warnings.push('same_series_different_game');
  } else if (containsTarget) {
    if (contentKind === 'game_package') {
      // Check if it's really the same game or different platform/edition
      const platformInTitle = platformFromTitle(title);
      const platformInCat = platformFromCategory(cat);
      const resolvedPlatform = platformInCat !== 'unknown' ? platformInCat : platformInTitle;
      const targetHasPlatform = (target.platforms ?? []).length > 0;
      const samePlatform =
        !targetHasPlatform ||
        resolvedPlatform === 'unknown' ||
        (target.platforms ?? []).some((tp) => {
          const ntp = tp.toLowerCase();
          const np = resolvedPlatform.toLowerCase();
          return ntp.includes(np) || np.includes(ntp);
        });
      seriesRelation = samePlatform ? 'exact_game' : 'same_game_different_platform';
      score += 50;
    } else {
      seriesRelation = 'same_game_different_edition';
      score += 30;
    }
  } else {
    // Check if result has same base as target (without series number)
    const targetNumInTitle = /\d+/.exec(target.title);
    const targetBase = normalizeTitle(target.title.replace(/\d+/g, '').trim());
    if (targetNumInTitle && targetBase.length >= 2 && normTitle.includes(targetBase)) {
      seriesRelation = 'same_series_previous_game';
      score -= 40;
      warnings.push('same_series_different_game');
    } else {
      seriesRelation = 'unrelated';
      score -= 40;
    }
  }

  // ── Step 5: source-trust boost ───────────────────────────────────────────
  // A direct or manual source means the URL itself is the canonical record:
  // a VNDB release.extlinks entry, a manually-pasted DP URL, a JAN-based
  // direct path. These are NOT broad title-search hits — they identify the
  // exact product by ID. When the title also contains the target, give a
  // strong boost so the result lands in 'high' or 'exact' confidence and
  // never gets surfaced as "low correspondance / weak match".
  if ((source === 'direct' || source === 'manual') && containsTarget && seriesRelation !== 'related_goods' && seriesRelation !== 'unrelated') {
    score += 30;
  }

  // ── Step 6: confidence ────────────────────────────────────────────────────
  let matchConfidence: MatchConfidence;
  if (score >= 100) matchConfidence = 'exact';
  else if (score >= 70) matchConfidence = 'high';
  else if (score >= 40) matchConfidence = 'medium';
  else if (score >= 10) matchConfidence = 'low';
  else matchConfidence = 'reject';

  return {
    contentKind,
    platform,
    editionKind,
    seriesRelation,
    matchConfidence,
    matchScore: score,
    matchWarnings: warnings,
  };
}

export type OfferGroup = 'game' | 'needs_review' | 'series' | 'related' | 'rejected';

/**
 * Map stored classification strings to a display group.
 * `low` and `reject` confidence go to the rejected bucket so they
 * never pollute the "Game packages" group.
 */
export function classifyOfferGroup(
  contentKind: string | null | undefined,
  seriesRelation: string | null | undefined,
  matchConfidence: string | null | undefined,
): OfferGroup {
  if (
    contentKind === 'bonus_only' ||
    contentKind === 'related_goods' ||
    contentKind === 'figure' ||
    contentKind === 'soundtrack' ||
    contentKind === 'artbook' ||
    contentKind === 'store_bonus_bundle' ||
    seriesRelation === 'related_goods'
  ) return 'related';
  if (matchConfidence === 'reject' || matchConfidence === 'low') return 'rejected';
  if (seriesRelation === 'same_series_previous_game' || seriesRelation === 'sequel_or_pack') return 'series';
  if (matchConfidence === 'medium') return 'needs_review';
  if (contentKind === 'game_package' || contentKind == null) return 'game';
  return 'game';
}

export function isEligibleGameStockOffer(offer: {
  availability: string | null | undefined;
  content_kind?: string | null;
  series_relation?: string | null;
  match_confidence?: string | null;
  price?: number | null;
}): boolean {
  if (offer.availability !== 'in_stock' && offer.availability !== 'limited') return false;
  const content = offer.content_kind ?? null;
  if (content !== null && content !== 'game_package' && content !== 'digital_download') return false;
  const confidence = offer.match_confidence ?? null;
  if (confidence !== null && confidence !== 'exact' && confidence !== 'high') return false;
  const relation = offer.series_relation ?? null;
  if (
    relation !== null &&
    relation !== 'exact_game' &&
    relation !== 'same_game_different_edition' &&
    relation !== 'same_game_different_platform'
  ) return false;
  return true;
}

/** Serialise classification fields for storage. */
export function classificationToFields(c: OfferClassification): {
  content_kind: string;
  platform: string;
  edition_kind: string;
  series_relation: string;
  match_confidence: string;
  match_score: number;
  match_warnings_json: string;
} {
  return {
    content_kind: c.contentKind,
    platform: c.platform,
    edition_kind: c.editionKind,
    series_relation: c.seriesRelation,
    match_confidence: c.matchConfidence,
    match_score: c.matchScore,
    match_warnings_json: JSON.stringify(c.matchWarnings),
  };
}
