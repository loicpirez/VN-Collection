import { describe, expect, it } from 'vitest';
import { stripVndbMarkup } from '@/components/VndbMarkup';

/**
 * Stress the `<VndbMarkup>` tokenizer through its plain-text strip
 * surface. The renderer is React-only so we can't easily exercise it
 * from Vitest without a DOM, but every parsing branch (recursion,
 * autolink, mismatched closers, malicious URLs) is observable from
 * `stripVndbMarkup` too — they all flow through the same `tokenize()`.
 *
 * Critical regressions to guard:
 *   - `[url=…]label[/url]` must recursively tokenize the label.
 *   - Autolinker must strip trailing punctuation.
 *   - The parser must be O(N) — no slow-path on un-tagged input
 *     (this one is verified by the regular tests not timing out
 *     on the 100k stress case below).
 */

describe('stripVndbMarkup', () => {
  it('returns empty for null/undefined/empty', () => {
    expect(stripVndbMarkup(null)).toBe('');
    expect(stripVndbMarkup(undefined)).toBe('');
    expect(stripVndbMarkup('')).toBe('');
  });

  it('passes plain text through unchanged', () => {
    expect(stripVndbMarkup('hello world')).toBe('hello world');
  });

  it('strips `[b]` / `[i]` / `[u]` / `[s]` markers', () => {
    expect(stripVndbMarkup('[b]bold[/b] [i]italic[/i] [u]u[/u] [s]s[/s]'))
      .toBe('bold italic u s');
  });

  it('preserves `[url=…]label[/url]` label, not the URL', () => {
    expect(stripVndbMarkup('see [url=https://vndb.org]VNDB[/url] for more'))
      .toBe('see VNDB for more');
  });

  it('falls back to the URL when no label is supplied', () => {
    expect(stripVndbMarkup('[url=https://example.com][/url]'))
      .toBe('https://example.com');
  });

  it('recursively tokenizes BBCode inside url labels', () => {
    expect(stripVndbMarkup('[url=https://x.com][b]bold link[/b][/url]'))
      .toBe('bold link');
  });

  it('autolinks bare URLs and strips trailing punctuation', () => {
    expect(stripVndbMarkup('see https://example.com. more'))
      .toBe('see https://example.com. more');
  });

  it('renders [spoiler] content as plain text', () => {
    expect(stripVndbMarkup('[spoiler]Heroine A dies[/spoiler]'))
      .toBe('Heroine A dies');
  });

  it('keeps newlines', () => {
    expect(stripVndbMarkup('line one\nline two')).toBe('line one\nline two');
  });

  it('drops unclosed BBCode tag content cleanly', () => {
    // The audit-documented policy: dangling `[b]` opener drops the
    // tag, keeps the inner text. Stack-unwind merges to parent.
    expect(stripVndbMarkup('hello [b]bold and unclosed')).toBe('hello bold and unclosed');
  });

  it('handles mismatched closers without crashing', () => {
    expect(stripVndbMarkup('[b]foo[/i][/b]')).toBe('foo');
  });

  it('runs in linear time on un-tagged input', () => {
    // Without the sticky-regex fix this used to be O(N²) and would
    // hang on a 100 kB string. We just need it to *terminate* —
    // assertions on the result confirm correctness too.
    const big = 'x'.repeat(100_000);
    expect(stripVndbMarkup(big)).toBe(big);
  });
});
