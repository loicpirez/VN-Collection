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

export function platformFromCategory(category: string): Platform {
  if (!category) return 'unknown';
  if (/ニンテンドースイッチ|Switch/i.test(category)) return 'Switch';
  if (/PS5|PlayStation\s*5/i.test(category)) return 'PS5';
  if (/PS4|PlayStation\s*4/i.test(category)) return 'PS4';
  if (/PSVita|PSVITA/i.test(category)) return 'PSVita';
  if (/PCソフト|Windows|パソコン|エロゲ/i.test(category)) return 'PC';
  return 'unknown';
}

export function platformFromTitle(title: string): Platform {
  if (/Switch|スイッチ|ニンテンドースイッチ/i.test(title)) return 'Switch';
  if (/PS5|PlayStation\s*5/i.test(title)) return 'PS5';
  if (/PS4|PlayStation\s*4/i.test(title)) return 'PS4';
  if (/PSVita|PS\s*Vita/i.test(title)) return 'PSVita';
  if (/PCソフト|for Windows/i.test(title)) return 'PC';
  return 'unknown';
}

export function editionFromTitle(title: string): EditionKind {
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
 * e.g. target = "アイキス3", result = "アイキス2" → true
 * e.g. target = "アイキス3", result = "アイキス3Cute" → false
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

/**
 * Classify a single offer result against a target VN.
 * Pure function: deterministic, no I/O.
 */
export function classifyOffer(
  title: string,
  category: string | null | undefined,
  target: ClassifyTarget,
): OfferClassification {
  const warnings: string[] = [];
  let score = 0;
  const cat = (category ?? '').trim();

  // ── Step 1: content kind ───────────────────────────────────────────────────
  const isBonusPrefix = /^\s*\[単品\]/.test(title);
  const goodsCat = isGoodsCategory(cat);
  const softwareCat = isSoftwareCategory(cat);

  let contentKind: ContentKind;
  if (isBonusPrefix) {
    contentKind = 'bonus_only';
    score -= 60;
    warnings.push('bonus-only item');
  } else if (isFigureCategory(cat)) {
    contentKind = 'figure';
    score -= 50;
    warnings.push('related goods category');
  } else if (isSoundtrackCategory(cat)) {
    contentKind = 'soundtrack';
    score -= 40;
    warnings.push('related goods category');
  } else if (isArtbookCategory(cat)) {
    contentKind = 'artbook';
    score -= 40;
    warnings.push('related goods category');
  } else if (goodsCat) {
    contentKind = 'related_goods';
    score -= 50;
    warnings.push('related goods category');
  } else if (softwareCat) {
    contentKind = 'game_package';
    score += 40;
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

  if (goodsCat || isBonusPrefix || contentKind === 'figure' || contentKind === 'soundtrack' || contentKind === 'artbook') {
    seriesRelation = 'related_goods';
    if (containsTarget) {
      score -= 30;
      warnings.push('only mentions target inside bonus description');
    }
  } else if (numMismatch) {
    seriesRelation = 'same_series_previous_game';
    score -= 40;
    warnings.push('same series but different game');
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
      warnings.push('same series but different game');
    } else {
      seriesRelation = 'unrelated';
      score -= 40;
    }
  }

  // ── Step 5: confidence ────────────────────────────────────────────────────
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

export type OfferGroup = 'game' | 'series' | 'related' | 'rejected';

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
  if (contentKind === 'game_package' || contentKind == null) return 'game';
  return 'game';
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
