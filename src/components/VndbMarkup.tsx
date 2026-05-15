import type { ReactNode } from 'react';

/**
 * Render VNDB-flavoured BBCode as React nodes. Description fields
 * arrive from VNDB carrying tags like `[url=...]label[/url]` plus
 * `[b]` / `[i]` / `[u]` / `[s]` / `[spoiler]`.
 *
 *   - `[url=…]label[/url]`           external anchor (target=_blank, scheme-allowlisted)
 *   - `[b]` / `[i]` / `[u]` / `[s]`  strong / em / underline / strike
 *   - `[spoiler]…[/spoiler]`         native `<details>` (no JS needed)
 *   - bare `http(s)://…`             autolinked
 *   - `\n`                           `<br />`
 *
 * URL hrefs are scheme-allowlisted (http/https/mailto/relative) to
 * block `javascript:` and `data:text/html` payloads in untrusted
 * descriptions. Anchors always carry `rel="noopener noreferrer"`.
 *
 * `tokenize()` is O(N): only invokes the regex on `[` characters and
 * uses a sticky/global regex with `lastIndex` instead of slicing.
 */

type Token =
  | { kind: 'text'; value: string }
  | { kind: 'br' }
  | { kind: 'url'; href: string; children: Token[]; fallback: string }
  | { kind: 'b' | 'i' | 'u' | 's' | 'spoiler'; children: Token[] };

const BBCODE_TAG = /\[(\/?)(url|b|i|u|s|spoiler)(?:=([^\]]+))?\]/giy;
const URL_CLOSE = /\[\/url\]/gi;
const SAFE_URL_SCHEME = /^(?:https?:|mailto:|\/)/i;
type InlineKind = 'b' | 'i' | 'u' | 's' | 'spoiler';

function sanitizeHref(raw: string): string {
  const trimmed = raw.trim();
  return SAFE_URL_SCHEME.test(trimmed) ? trimmed : '#';
}

function tokenize(input: string): Token[] {
  const out: Token[] = [];
  const stack: Array<{ kind: InlineKind; tokens: Token[] }> = [];
  let buf = '';
  let i = 0;

  const target = (): Token[] => (stack.length ? stack[stack.length - 1].tokens : out);
  const flush = (): void => {
    if (!buf) return;
    pushText(target(), buf);
    buf = '';
  };

  while (i < input.length) {
    const ch = input[i];
    if (ch === '\n') {
      flush();
      target().push({ kind: 'br' });
      i += 1;
      continue;
    }
    if (ch === '[') {
      BBCODE_TAG.lastIndex = i;
      const match = BBCODE_TAG.exec(input);
      if (match) {
        flush();
        const close = match[1] === '/';
        const tag = match[2].toLowerCase() as 'url' | InlineKind;
        const attr = match[3];
        if (tag === 'url' && !close) {
          const start = i + match[0].length;
          URL_CLOSE.lastIndex = start;
          const endMatch = URL_CLOSE.exec(input);
          if (endMatch && attr) {
            const labelSrc = input.slice(start, endMatch.index);
            target().push({
              kind: 'url',
              href: sanitizeHref(attr),
              children: tokenize(labelSrc),
              fallback: attr.trim(),
            });
            i = endMatch.index + endMatch[0].length;
            continue;
          }
          i += match[0].length;
          continue;
        }
        if (!close) {
          stack.push({ kind: tag as InlineKind, tokens: [] });
          i += match[0].length;
          continue;
        }
        const top = stack[stack.length - 1];
        if (top && top.kind === tag) {
          stack.pop();
          target().push({ kind: top.kind, children: top.tokens });
          i += match[0].length;
          continue;
        }
        i += match[0].length;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  while (stack.length) {
    const frame = stack.pop()!;
    target().push(...frame.tokens);
  }
  return out;
}

function pushText(arr: Token[], value: string): void {
  const urlRe = /https?:\/\/[^\s<>"'\])}]+/gi;
  let last = 0;
  for (const m of value.matchAll(urlRe)) {
    if (m.index === undefined) continue;
    const trimmed = m[0].replace(/[.,;:!?)]+$/, '');
    if (m.index > last) arr.push({ kind: 'text', value: value.slice(last, m.index) });
    arr.push({ kind: 'url', href: sanitizeHref(trimmed), children: [{ kind: 'text', value: trimmed }], fallback: trimmed });
    last = m.index + trimmed.length;
  }
  if (last < value.length) arr.push({ kind: 'text', value: value.slice(last) });
}

function renderTokens(tokens: Token[], spoilerLabel: string, keyPrefix = 'm'): ReactNode {
  return tokens.map((tok, idx): ReactNode => {
    const key = `${keyPrefix}-${idx}`;
    switch (tok.kind) {
      case 'text':
        return tok.value;
      case 'br':
        return <br key={key} />;
      case 'url':
        return (
          <a
            key={key}
            href={tok.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            {tok.children.length > 0 ? renderTokens(tok.children, spoilerLabel, key) : tok.fallback}
          </a>
        );
      case 'b':
        return <strong key={key}>{renderTokens(tok.children, spoilerLabel, key)}</strong>;
      case 'i':
        return <em key={key}>{renderTokens(tok.children, spoilerLabel, key)}</em>;
      case 'u':
        return <span key={key} className="underline">{renderTokens(tok.children, spoilerLabel, key)}</span>;
      case 's':
        return <span key={key} className="line-through">{renderTokens(tok.children, spoilerLabel, key)}</span>;
      case 'spoiler':
        return (
          <details key={key} className="inline">
            <summary className="inline-flex cursor-pointer items-center gap-1 rounded bg-bg-elev/60 px-1 text-muted hover:text-white [&::-webkit-details-marker]:hidden [list-style:none]">
              <svg aria-hidden viewBox="0 0 16 16" className="h-3 w-3 transition-transform [details[open]>summary>&]:rotate-90"><path fill="currentColor" d="M5 3l6 5-6 5z"/></svg>
              {spoilerLabel}
            </summary>
            <span>{renderTokens(tok.children, spoilerLabel, key)}</span>
          </details>
        );
    }
  });
}

export function VndbMarkup({
  text,
  className,
  spoilerLabel = 'spoiler',
}: {
  text: string | null | undefined;
  className?: string;
  /** Localised summary text for `[spoiler]…[/spoiler]`. Server pages pass `t.spoiler.markupSummary`. */
  spoilerLabel?: string;
}) {
  if (!text) return null;
  const tokens = tokenize(text);
  return <span className={className}>{renderTokens(tokens, spoilerLabel)}</span>;
}

/**
 * Plain-text strip — same parser, renders only the visible label.
 * Used by filter chips, search snippets, anything that needs a
 * BBCode-free string. All four legacy inline `stripBb` helpers
 * across the app should route through here.
 */
export function stripVndbMarkup(text: string | null | undefined): string {
  if (!text) return '';
  const tokens = tokenize(text);
  return collapse(tokens);
}

function collapse(tokens: Token[]): string {
  let out = '';
  for (const tok of tokens) {
    switch (tok.kind) {
      case 'text':
        out += tok.value;
        break;
      case 'br':
        out += '\n';
        break;
      case 'url':
        out += collapse(tok.children) || tok.fallback;
        break;
      case 'b':
      case 'i':
      case 'u':
      case 's':
      case 'spoiler':
        out += collapse(tok.children);
        break;
    }
  }
  return out;
}
