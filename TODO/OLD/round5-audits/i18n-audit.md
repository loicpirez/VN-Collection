# i18n Audit Report — agent a1a3767af4232f4b2

Now I have all the data needed. Let me compile the full report.

---

## Full i18n Audit Report — vndb-collection-new

---

### CATEGORY 1: HARDCODED ENGLISH STRINGS IN JSX

---

```
ISSUE [i18n] [src/app/global-error.tsx:29,33,36,40,56]
Severity: HIGH
Description: Global error boundary renders a self-contained <html> with hardcoded English strings
  for every user regardless of their configured locale.
Code:
  <html lang="en">
  <h1>Something broke.</h1>
  <p>The page hit an unexpected error. Try refreshing — if it persists, restart the server.</p>
  <p>digest: {error.digest}</p>
  <button>Try again</button>
Fix: This boundary intentionally cannot access the i18n provider (per code comment), but the
  lang attribute should at minimum derive from the locale cookie (readable server-side or via
  document.cookie client-side before hydration). The text strings can be kept as a failsafe
  English fallback given the provider outage context, but the lang attribute being hardcoded
  to "en" is incorrect for FR/JA users. Either read the cookie in useEffect to set lang, or
  accept this as an intentional limitation and document it explicitly.
```

---

```
ISSUE [i18n] [src/app/staff/[id]/page.tsx:503-504]
Severity: MEDIUM
Description: aria-label and title on the VNDB external link anchor are hardcoded to "VNDB"
  instead of a translated accessible label (e.g. "Voir sur VNDB" in FR).
Code:
  aria-label="VNDB"
  title="VNDB"
Fix: Add a t.staff.vndbLinkLabel key (FR: "Voir sur VNDB", EN: "View on VNDB",
  JA: "VNDBで見る") and replace with aria-label={t.staff.vndbLinkLabel}.
  A bare brand name is not a meaningful accessible label for a link.
```

---

```
ISSUE [i18n] [src/components/VnTagsGroupedView.tsx:184-185]
Severity: MEDIUM
Description: Same pattern as staff page — aria-label="VNDB" and title="VNDB" on an external
  VNDB link button. Brand name alone is not a useful accessible label.
Code:
  aria-label="VNDB"
  title="VNDB"
Fix: Use a shared t.common.viewOnVndb key or per-section key with translated action text.
```

---

```
ISSUE [i18n] [src/components/OwnedEditionsSection.tsx:706]
Severity: LOW
Description: The platform input placeholder "win, ps4, swi…" is hardcoded English example text.
  For JA/FR users, the raw platform codes are semi-technical but the instructional ellipsis
  framing makes this a UI string.
Code:
  placeholder="win, ps4, swi…"
Fix: Add t.form.platformPlaceholder (FR: "win, ps4, swi…", EN same, JA: "win, ps4, swi…")
  or use t.form.platformInputHint. The codes themselves are universal; the framing should
  at minimum live in the dictionary so it can be adapted per locale.
```

---

```
ISSUE [i18n] [src/components/OwnedEditionsSection.tsx:774]
Severity: LOW
Description: Currency input placeholder "JPY" is a hardcoded example currency code.
  This is a hint to the user about what format to enter, not a purely technical value.
Code:
  placeholder="JPY"
Fix: Add t.form.currencyPlaceholder with value "JPY" (same across all locales is fine,
  but it must be in the dictionary for translatability).
```

---

```
ISSUE [i18n] [src/components/CoverSourcePicker.tsx:422]
Severity: LOW
Description: alt="VNDB" on a SafeImage displaying the VNDB cover thumbnail. The alt text
  is a brand name only and does not describe the image content.
Code:
  <SafeImage src={vndbImage} alt="VNDB" className="h-full w-full" />
Fix: Use a descriptive alt key such as t.coverPicker.vndbThumbAlt
  (FR: "Couverture VNDB", EN: "VNDB cover", JA: "VNDBカバー").
```

---

```
ISSUE [i18n] [src/components/OwnedEditionsSection.tsx:827,841]
Severity: LOW
Description: Numeric placeholders "1280" and "720" for width/height inputs are bare numbers.
  While numbers are locale-neutral, they serve as example hint values and the inputs already
  have translated aria-label attributes — the placeholder gap is minor but inconsistent.
Code:
  placeholder="1280"   (width)
  placeholder="720"    (height)
Fix: Acceptable as-is given purely numeric nature; flag as LOW for awareness.
```

---

```
ISSUE [i18n] [src/components/SettingsButton.tsx:559]
Severity: LOW
Description: VNDB API token input uses placeholder "vndb-..." which is a format hint.
  This is technically a token format pattern (not a natural language string) but it appears
  in a UI input field alongside translated labels.
Code:
  placeholder="vndb-..."
Fix: Acceptable as a technical format hint — purely technical strings are exempted.
  No change required; noted for completeness only.
```

---

```
ISSUE [i18n] [src/components/ListAddVnForm.tsx:50]
Severity: LOW
Description: Placeholder "v123 / egs_456" is a VNDB/EGS ID format hint. Technical
  and format-specific, not natural language.
Code:
  placeholder="v123 / egs_456"
Fix: Technical ID format — exempt from i18n requirement. Noted for completeness.
```

---

### CATEGORY 2: HARDCODED RAW ENUM VALUES RENDERED DIRECTLY

No instances found. Status enum values ('playing', 'completed', etc.) found in codebase are only used in:
- `JSON.stringify()` API payloads
- Comparison expressions (`===`)
- TypeScript type definitions

Status labels are correctly rendered via `t.status[value]` or through a `statusLabels` map derived from `t.status`.

Language codes are rendered via `languageDisplayName()` throughout; platform codes via `platformLabel()`. However, see Category 5 below regarding locale-blindness of those helpers.

---

### CATEGORY 3: MISSING i18n KEYS

```
ISSUE [i18n] [src/lib/i18n/dictionaries.ts — all locales, recommend.explain section]
Severity: LOW
Description: The key `recommend.explain.filterEroOff` does not exist in any locale (FR, EN, JA)
  but the `filterEroOn` sibling key does exist. This is an asymmetric pair. The recommendations
  page only renders filterEroOn (only when includeEro is true), so no runtime error occurs —
  but the Off state silently shows nothing, which may be intentional design or an oversight.
Code (dictionaries.ts):
  filterEroOn: 'Tags érotiques inclus'  // FR line 154
  filterEroOn: 'Ero tags included'       // EN line 2679
  filterEroOn: 'エロタグを含む'           // JA line 5201
  // filterEroOff: <MISSING in all locales>
Code (recommendations/page.tsx:693-696):
  {includeEro && (
    <span>{explain.filterEroOn}</span>
  )}
  // No else branch renders filterEroOff
Fix: Either add filterEroOff to all 3 locales and render it in the else branch for symmetry
  with filterOwnedOff/filterWishlistOff, or document this as intentional (ero filter active
  state only is shown). The current asymmetry is a latent gap.
```

No other cross-locale key mismatches detected during the audit sweep. All major sections (errorBoundary, nav, status, library, form, detail, settings, etc.) appear structurally consistent across FR/EN/JA.

---

### CATEGORY 4: DEAD i18n KEYS

No definitively dead keys were identified during this audit. All top-level sections checked (maintenance, schemaPage, dumped, recommend, tags, traits, characters, staff, releases, series, lists, quotes, media, etc.) have confirmed consumers in .tsx/.ts files. A complete automated dead-key scan would require TypeScript compiler API tooling; this audit verified all major sections by spot-checking.

---

### CATEGORY 5: TEMPLATE LITERAL SUBSTITUTION BUGS

No double-substitution bugs found. All template placeholders in the codebase use unique names per string (`{n}`, `{from}`, `{to}`, `{a}`, `{b}`, `{label}`, etc.), and `.replace()` is chained with distinct placeholder names. No key uses the same placeholder token twice in a single value.

---

### CATEGORY 6: PERSONAL PHRASING IN FRENCH (SYSTEMIC)

```
ISSUE [i18n] [src/lib/i18n/dictionaries.ts — FR locale, systemic]
Severity: HIGH
Description: The French locale uses second-person singular (tu/ta/tes/ton) and first-person
  singular (ma/mon/mes/je) throughout nearly every section. The app should use neutral
  phrasing ("la collection", "les notes", "l'utilisateur") consistent with professional French
  software UI conventions (see: Netflix, Spotify, Apple App Store France — all use "vous" or
  neutral nouns). The current phrasing is informal and inconsistent (some labels use neutral
  "la collection" while nearby strings use "ta collection").

Confirmed instances (line numbers in dictionaries.ts):
  Line 188:  "des éditeurs déjà présents dans ta collection."
  Line 283:  "Crée un token sur ton profil VNDB"
  Line 482:  user_rating: 'Ma note'
  Line 483:  playtime: 'Mon temps de jeu'
  Line 506:  "Chercher dans ta collection locale"
  Line 508:  "dans tes notes perso"
  Line 513:  "dans tes notes & citations"
  Line 514:  "chercher dans tes notes, synopsis personnalisés et citations"
  Line 665:  mine: 'Mon temps'
  Line 679:  myRatingLabel: 'Ma note'
  Line 682:  myPlaytime: 'Mon temps'
  Line 733:  myTracking: 'Mon suivi'
  Line 735:  myRating: 'Ma note (10–100)'
  Line 752:  "Ce VN n'est pas encore dans ta collection."
  Line 925:  "les VN déjà dans ta collection. N'ajoute pas de nouvelle VN."
  Line 948:  "Synchronise tes notes et heures de jeu... avec ton compte uid public."
  Line 951:  "présent dans l'URL de ton profil EGS."
  Line 987:  placeholder: '# Mes notes\n\nMa **route préférée**'
  Line 997:  "Aucun développeur dans ta collection."
  Line 1001: "Aucun studio dans ta collection."
  Line 1040: "Le VN doit être dans ta collection."
  Line 1057: pageTitle: 'Mes listes'
  Line 1175: "apparaissent dans des VN de ta collection."
  Line 1189: ownedTitle: 'Dans ta collection'
  Line 1202: "qui ne sont pas dans ta collection."
  Line 1393: histogramTitle: 'Mes notes vs VNDB'
  Line 1395: legendMine: 'Mes notes'
  Line 1405: "{n} VN à découvrir — clique pour ajouter à ta collection."
  Line 1421: "Chercher dans ta collection ou VNDB…"
  Line 1509: step_lists_title: 'Mes listes'
  Line 1514: "ta collection / les plus attendus EGS"
  Line 1545: "Dans tes notes et citations (local)"
  Line 1546: "tes notes personnelles, synopsis perso et citations sauvegardées"
  Line 1547: "dans tes notes, synopsis ou citations."
  Line 1556: "Importer ton temps de jeu et tes notes depuis ErogameScape."
  Line 1585: user_rating: 'Ma note'
  Line 1900: removeFromList: 'Retirer de ma liste VNDB'
  Line 1904: "Label personnalisé de ton profil VNDB."
  Line 1905: detailsToggle: 'Modifier ma note / dates / notes VNDB'
  Line 2390: "Clique pour filtrer ta collection."

Fix: Replace tu/ta/tes/ton with neutral constructs:
  - "ta collection" → "la collection" or "votre collection"
  - "tes notes" → "les notes" or "vos notes"
  - "ton profil" → "le profil" or "votre profil"
  - "Ma note" → "Note" or "Évaluation"
  - "Mon temps" → "Temps de jeu"
  - "Mes listes" → "Listes"
  - "Mon suivi" → "Suivi"
  - "Ma note (10–100)" → "Note (10–100)"
  Labels like 'Ma note' appear in sort dropdowns and form fields where they
  should be functional labels, not possessive: "Note" is sufficient.
```

---

### CATEGORY 7: DATE/TIME LOCALE

```
ISSUE [i18n] [src/app/character/[id]/page.tsx:31]
Severity: MEDIUM
Description: `fmtBirthday` renders a month name using 'default' locale instead of the app
  locale. When the user has configured FR or JA, the month name still renders in the
  OS/browser default locale (typically English in server contexts).
Code:
  if (!d) return new Date(0, m - 1).toLocaleString('default', { month: 'long' });
Fix: The character page already calls `getDict()`, so also call `getLocale()` and pass the
  BCP47 locale tag to toLocaleString:
  return new Date(0, m - 1).toLocaleString(LOCALE_BCP47[locale] ?? 'fr-FR', { month: 'long' });
```

---

```
ISSUE [i18n] [src/app/top-ranked/page.tsx:203,225 / src/app/upcoming/page.tsx:176]
Severity: MEDIUM
Description: StaleEgsBanner and its equivalent in upcoming use `.toLocaleString()` with no
  locale argument, producing OS-locale timestamps shown as "last updated at" indicators
  visible to users.
Code (top-ranked/page.tsx:203):
  const when = fetchedAt ? new Date(fetchedAt).toLocaleString() : '—';
Code (upcoming/page.tsx:176):
  ? new Date(fetchedAt).toLocaleString()
Fix: Both pages call getDict() but not getLocale(). Add getLocale() call and pass a BCP47
  tag: new Date(fetchedAt).toLocaleString(LOCALE_BCP47[locale] ?? 'fr-FR').
```

---

```
ISSUE [i18n] [src/components/CachePanel.tsx:25 / src/components/SchemaEgsSection.tsx:19 / src/components/RefreshScopeButton.tsx:113]
Severity: LOW
Description: Three client/server components format timestamps with bare .toLocaleString()
  producing OS-locale output. These are in admin/developer panels (cache stats, schema
  inspector, data freshness chip) so user impact is lower, but the pattern is still
  locale-inconsistent.
Code:
  return new Date(ts).toLocaleString();           // CachePanel:25
  return new Date(ts).toLocaleString();           // SchemaEgsSection:19
  new Date(lastUpdatedAt).toLocaleString()        // RefreshScopeButton:113
Fix: For client components, use the locale from useLocale()/useT() context + LOCALE_BCP47 map.
  For server components, call getLocale() and pass the BCP47 tag.
```

---

```
ISSUE [i18n] [src/app/recommendations/page.tsx:721 / src/app/top-ranked/page.tsx:107,108,354,470,595 / src/app/trait/[id]/page.tsx:63 / src/app/tag/[id]/page.tsx:268,383 / src/components/TagsBrowser.tsx:350,378,436 / src/components/TagPicker.tsx:180 / src/components/EgsPanel.tsx:341,346,548 / etc.]
Severity: LOW
Description: Numeric .toLocaleString() calls (for vote counts, VN counts, item counts) with no
  locale argument. Number formatting differs by locale: French uses space as thousands separator
  (1 234), Japanese uses commas (1,234), English uses commas (1,234). With no locale arg these
  render using OS defaults.
Code example (recommendations/page.tsx:721):
  r.votecount.toLocaleString()
Fix: Pass the BCP47 locale tag: r.votecount.toLocaleString(LOCALE_BCP47[locale] ?? 'fr-FR').
  Since the LOCALE_BCP47 map is already defined in GameLog.tsx, extract it to a shared
  lib/locale-utils.ts helper.
```

---

### CATEGORY 8: LOCALE-BLIND DISPLAY HELPERS

```
ISSUE [i18n] [src/lib/language-names.ts — entire file]
Severity: HIGH
Description: languageDisplayName() is locale-blind — it always returns English-only names
  (e.g. "Japanese", "French", "Chinese (Simplified)") regardless of the app locale.
  When the app is configured to FR or JA, language names in filters, chips, search results,
  staff pages, shelf view, compare view, and wishlist grouping still display in English.
  This affects a large number of call sites:
    - src/app/compare/page.tsx:206
    - src/app/staff/page.tsx:233,235,301
    - src/app/staff/[id]/page.tsx:140
    - src/app/shelf/page.tsx:519
    - src/components/WishlistClient.tsx:339
    - src/components/LangFlag.tsx:24,56
    - src/components/SearchClient.tsx:479
Code:
  ja: 'Japanese'   // always English, even when app locale is 'fr' or 'ja'
  fr: 'French'
Fix: Replace the static map with `new Intl.DisplayNames([localeBCP47], { type: 'language' })`
  which returns locale-native names (e.g. in FR: "japonais", "français"; in JA: "日本語", "フランス語").
  Change the function signature to languageDisplayName(code, locale) and use:
    new Intl.DisplayNames([LOCALE_BCP47[locale] ?? 'fr-FR'], { type: 'language' }).of(code) ?? code.toUpperCase()
  Intl.DisplayNames is available in all supported Node.js versions and modern browsers.
```

---

### CATEGORY 8: ERROR BOUNDARY MESSAGES

All route-segment error boundaries are correctly i18n'd:
- `src/app/error.tsx` — uses `useT()` and `t.errorBoundary.*`
- `src/app/vn/[id]/error.tsx` — uses `useT()` and `t.errorBoundary.*`
- `src/app/tag/[id]/error.tsx` — uses `useT()` and `t.errorBoundary.*`
- `src/app/staff/[id]/error.tsx` — uses `useT()` and `t.errorBoundary.*`
- All other per-route error.tsx files follow the same pattern

Only `src/app/global-error.tsx` has hardcoded English — this is intentional per code comment (provider is unavailable at that level), reported under Category 1 HIGH above.

---

## SUMMARY

| Severity | Count | Issues |
|----------|-------|--------|
| HIGH | 3 | global-error.tsx hardcoded English; language-names.ts locale-blind helper; FR systemic tu/ta/ma/mon/mes phrasing |
| MEDIUM | 4 | aria-label="VNDB" ×2 (staff page, VnTagsGroupedView); character page fmtBirthday 'default' locale; top-ranked/upcoming StaleEgsBanner locale-blind timestamp |
| LOW | 9 | placeholder="JPY"; placeholder="win, ps4, swi…"; alt="VNDB" (CoverSourcePicker); CachePanel/SchemaEgsSection/RefreshScopeButton locale-blind timestamps; numeric toLocaleString without locale (10+ sites); filterEroOff missing key asymmetry; placeholder="1280"/"720" (noted, exempt) |

**Total confirmed issues: 16** (3 HIGH, 4 MEDIUM, 9 LOW)

---

## FALSE_CLOSURE FLAGS

No prior checklist existed for this audit (fresh audit session), so no false closure claims are present. The following are areas that might be incorrectly assumed clean by a future reviewer:

- **FALSE_CLOSURE RISK**: `Intl.DateTimeFormat` usages in `GameLog.tsx` and `DateInput.tsx` are correctly locale-aware. However, `toLocaleString()` calls in the same codebase without arguments are not — these are different patterns and should not be conflated.
- **FALSE_CLOSURE RISK**: The `errorBoundary` dictionary section exists and is used by all route-segment error.tsx files, but `global-error.tsx` bypasses it entirely. A review that checks "does errorBoundary exist in all locales?" would pass but miss the real issue.
- **FALSE_CLOSURE RISK**: `languageDisplayName()` is always called, so it appears to correctly go through a helper. The helper itself being locale-blind is the issue — call-site audits that only verify "is there a helper?" will miss this.