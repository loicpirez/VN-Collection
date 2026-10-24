# Japanese title ordering

The library and wishlist offer Japanese gojuon ordering: あいうえお,
かきくけこ, さしすせそ, and the remaining kana rows. Display language does
not change this ordering. Existing title, date, score and custom sorts remain
available, and no existing default or physical shelf placement is changed.

## Controls and API

- Library: select Japanese (あいうえお), then use the existing direction
  arrow. The URL is `?sort=title_kana&order=asc` or `order=desc`.
- Settings > Library: `default_sort=title_kana` can be persisted with the
  existing `default_order`. Explicit URL parameters still take priority.
- Wishlist: choose Japanese (あいうえお) or Japanese (reverse).
  The corresponding `sort` values are `title_kana` and `title_kana_desc`.
  Filters, grouping, hiding owned entries and pagination continue to apply.

`GET /api/collection` accepts `title_kana` with its existing order and page
parameters. `GET /api/wishlist` applies Japanese ordering before slicing a
requested page, like its other sort modes. The legacy unpaginated wishlist
response stays compatible; the client fallback uses the same comparator.

## Reading sources

Reading priority is cached EGS `gamename_furigana`, a Japanese or alternate
title already written without kanji, then the explicit romanization of a
Japanese VNDB title. Romanization is converted with
[WanaKana](https://wanakana.com/docs/). A translated English display title is
not treated as a Japanese reading. Romanizations can be ambiguous, especially
for long vowels; EGS furigana takes precedence when available.

Titles without an available reading stay last in both directions. Their
fallback title ordering is deterministic but is not presented as a recovered
kanji pronunciation. No AI reading generation or per-title network lookup is
performed. The wishlist requests VNDB title records through its existing
paginated ulist fetch and batch-reads locally cached EGS furigana, including
entries outside collection membership.

Width and kana script are normalized. Long vowels are expanded, small kana
and voicing share their base-kana primary ordering, and numeric suffixes use
natural order. Secondary kana differences, displayed title and VN id break
ties. Stored titles, metadata and manual custom order are unchanged.

## Pagination and verification

SQLite and PostgreSQL fetch the complete filtered reading projection for this
sort, apply the shared comparator, and only then slice the requested window.
Only the visible page is enriched with series, EGS summaries, places and
aspect data. Other sorts retain their existing SQL pagination.

`yarn test` covers reading normalization, source priority, missing metadata,
both directions, API and wishlist decoding, defaults and component controls.
`yarn test:cov` also runs the same collection-list ordering contract against
PostgreSQL and requires 100 percent coverage in all four metrics.

`scripts/browser-japanese-sort.mjs` exercises the real library API on an
isolated synthetic database and the wishlist controls with synthetic API
responses. It checks selection, reverse order, reload persistence and
overflow on desktop Chromium and 390 px touch WebKit in FR, EN and JA.
Use `VNCOLL_QA=1`, an isolated loopback `BASE_URL`, and optionally `QA_OUTPUT`.
Start an empty isolated app database, request its health endpoint to initialize
the schema, and run `scripts/seed-japanese-sort-qa.mjs` with its absolute
`.qa` `DB_PATH`. The seeder refuses nonempty collections. Serve the test through
`scripts/japanese-sort-qa-proxy.mjs`, supplying disposable `QA_TLS_KEY` and
`QA_TLS_CERT`, plus `QA_UPSTREAM`. A matching disposable
`TRUSTED_PROXY_SECRET` and `ALLOW_TRUSTED_PROXY=1` on the isolated app keep the
settings route authenticated through HTTPS without changing production config.
The proxy supplies only synthetic wishlist GET responses; collection reads
still reach the real isolated app. No browser request interception is needed.
This is browser-engine emulation, not acceptance on a physical iPhone.

## Deployment and rollback

There is no schema migration. Use the immutable-release deployment described
in [PostgreSQL operations](POSTGRESQL_OPERATIONS.md), retain the previous
release, and verify its commit, symlink, process directory and live sort.
Rollback consists of reactivating the preceding immutable release; no data
restore or rewrite of collection rows is needed for this feature.
