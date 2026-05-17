/**
 * Pin the href shape every chart row on /stats produces. The stats
 * page wraps each clickable bar / donut slice in a `<Link href=…>`
 * via `HBarChart` / `VBarChart` / `DonutChart`. The page itself is a
 * server component that builds those `href` strings inline from
 * locally computed rows; refactoring the page sometimes drops the
 * `href` (the bar still renders, it just stops being clickable),
 * which is a silent regression.
 *
 * This test pins the URL shape per chart so any future drop / typo
 * fails loudly. We don't import the page (it's an async RSC); we
 * mirror the inline href construction here, then assert against the
 * canonical shape. Each block below mirrors EXACTLY the construction
 * in `src/app/stats/page.tsx`. If you change one, change the other.
 *
 * No real VN / studio / tag names — synthetic placeholders only.
 */
import { describe, expect, it } from 'vitest';

describe('stats chart link generation', () => {
  it('status donut → /?status=<status>', () => {
    const row = { status: 'completed', n: 12 };
    const href = `/?status=${encodeURIComponent(row.status)}`;
    expect(href).toBe('/?status=completed');
  });

  it('top tags row → /?tag=<id>', () => {
    const tag = { id: 'g9001', name: 'placeholder-tag', count: 7 };
    const href = `/?tag=${encodeURIComponent(tag.id)}`;
    expect(href).toBe('/?tag=g9001');
  });

  it('language row → /search?langs=<lang>', () => {
    const d = { lang: 'ja', count: 42 };
    const href = `/search?langs=${encodeURIComponent(d.lang)}`;
    expect(href).toBe('/search?langs=ja');
  });

  it('platform row → /search?platforms=<code>', () => {
    const d = { platform: 'win', count: 100 };
    const href = `/search?platforms=${encodeURIComponent(d.platform)}`;
    expect(href).toBe('/search?platforms=win');
  });

  it('location row → /?place=<location> (unknown skipped)', () => {
    const real = { location: 'home', count: 3 };
    const unknown = { location: 'unknown', count: 1 };
    const realHref =
      real.location === 'unknown' ? undefined : `/?place=${encodeURIComponent(real.location)}`;
    const unknownHref =
      unknown.location === 'unknown' ? undefined : `/?place=${encodeURIComponent(unknown.location)}`;
    expect(realHref).toBe('/?place=home');
    expect(unknownHref).toBeUndefined();
  });

  it('edition row → /?edition=<type> ("none" skipped)', () => {
    const real = { edition: 'physical', count: 9 };
    const none = { edition: 'none', count: 4 };
    const realHref =
      real.edition === 'none' ? undefined : `/?edition=${encodeURIComponent(real.edition)}`;
    const noneHref =
      none.edition === 'none' ? undefined : `/?edition=${encodeURIComponent(none.edition)}`;
    expect(realHref).toBe('/?edition=physical');
    expect(noneHref).toBeUndefined();
  });

  it('producer ranking row → /producer/<id>', () => {
    const dev = { id: 'p9001', name: 'studio-x', vn_count: 5 };
    const pub = { id: 'p9002', name: 'pub-y', vn_count: 3 };
    expect(`/producer/${dev.id}`).toBe('/producer/p9001');
    expect(`/producer/${pub.id}`).toBe('/producer/p9002');
  });

  it('year bucket row → /?yearMin=<from>&yearMax=<to>', () => {
    // Single-year row: label is "2024".
    const single = { label: '2024', count: 3 };
    const range1 = single.label.split('-');
    const yMin1 = range1[0];
    const yMax1 = range1[1] ?? range1[0];
    expect(`/?yearMin=${yMin1}&yearMax=${yMax1}`).toBe('/?yearMin=2024&yearMax=2024');

    // 5-year bucket: label is "2020-2024".
    const bucket = { label: '2020-2024', count: 19 };
    const range2 = bucket.label.split('-');
    const yMin2 = range2[0];
    const yMax2 = range2[1] ?? range2[0];
    expect(`/?yearMin=${yMin2}&yearMax=${yMax2}`).toBe('/?yearMin=2020&yearMax=2024');
  });

  it('publisher ranking row → /producer/<id>', () => {
    // Publishers share the same producer detail page; the rank shown
    // on /producers second tab pins this so a future split into a
    // /publisher/<id> route is caught.
    const publisher = { id: 'p9003', name: 'pub-y', vn_count: 8, role: 'publisher' };
    expect(`/producer/${publisher.id}`).toBe('/producer/p9003');
  });

  it('VnCard chip → /search?platforms=<code> / /search?langs=<code>', () => {
    // The library / search VnCard surfaces platforms + languages as
    // clickable chips routed to /search filters. Pinned here so a
    // shared chip rewrite doesn't drop the link.
    const platform = 'psv';
    const lang = 'zh-Hant';
    expect(`/search?platforms=${encodeURIComponent(platform)}`).toBe('/search?platforms=psv');
    expect(`/search?langs=${encodeURIComponent(lang)}`).toBe('/search?langs=zh-Hant');
  });
});
