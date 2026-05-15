import type { ReactNode } from 'react';

/**
 * Render VNDB-flavoured BBCode as React nodes. Description fields
 * arrive from VNDB carrying tags like `[url=...]label[/url]` plus
 * `[b]` / `[i]` / `[u]` / `[s]` / `[spoiler]`. Until now most
 * call sites either ran them through a `stripBbcode` helper
 * (lost the links) or rendered the raw markup (leaked syntax into
 * the UI). This component is the single source of truth.
 *
 *   • `[url=…]label[/url]`           → external anchor (target=_blank)
 *   • `[b]` / `[i]` / `[u]` / `[s]`  → strong / em / underline / strike
 *   • `[spoiler]…[/spoiler]`         → native `<details>` (no JS needed)
 *   • bare `http(s)://…`             → autolinked
 *   • `\n`                           → `<br />`
 *
 * Unknown / malformed tags are dropped silently — matching the
 * existing strip helpers' policy. Anchors always carry
 * `rel="noopener noreferrer"` and `target="_blank"`.
 */

type Token =
  | { kind: 'text'; value: string }
  | { kind: 'br' }
  | { kind: 'url'; href: string; label: string }
  | { kind: 'b' | 'i' | 'u' | 's' | 'spoiler'; children: Token[] };

const BBCODE_TAG = /\[(\/?)(url|b|i|u|s|spoiler)(?:=([^\]]+))?\]/i;
type InlineKind = 'b' | 'i' | 'u' | 's' | 'spoiler';

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
    if (input[i] === '\n') {
      flush();
      target().push({ kind: 'br' });
      i += 1;
      continue;
    }
    const rest = input.slice(i);
    const match = rest.match(BBCODE_TAG);
    if (match && match.index === 0) {
      flush();
      const close = match[1] === '/';
      const tag = match[2].toLowerCase() as 'url' | InlineKind;
      const attr = match[3];
      if (tag === 'url' && !close) {
        const start = i + match[0].length;
        const end = input.toLowerCase().indexOf('[/url]', start);
        if (end >= 0 && attr) {
          const label = input.slice(start, end);
          target().push({ kind: 'url', href: attr.trim(), label });
          i = end + '[/url]'.length;
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
    buf += input[i];
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
  // Autolink bare http(s) URLs so trailing notes like
  // "see https://example.com" still render as a link without
  // explicit `[url=…]` markup.
  const urlRe = /https?:\/\/[^\s<>"'\])}]+/gi;
  let last = 0;
  for (const m of value.matchAll(urlRe)) {
    if (m.index === undefined) continue;
    if (m.index > last) arr.push({ kind: 'text', value: value.slice(last, m.index) });
    arr.push({ kind: 'url', href: m[0], label: m[0] });
    last = m.index + m[0].length;
  }
  if (last < value.length) arr.push({ kind: 'text', value: value.slice(last) });
}

function renderTokens(tokens: Token[], keyPrefix = 'm'): ReactNode {
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
            {tok.label || tok.href}
          </a>
        );
      case 'b':
        return <strong key={key}>{renderTokens(tok.children, key)}</strong>;
      case 'i':
        return <em key={key}>{renderTokens(tok.children, key)}</em>;
      case 'u':
        return <span key={key} className="underline">{renderTokens(tok.children, key)}</span>;
      case 's':
        return <span key={key} className="line-through">{renderTokens(tok.children, key)}</span>;
      case 'spoiler':
        return (
          <details key={key} className="inline">
            <summary className="cursor-pointer rounded bg-bg-elev/60 px-1 text-muted hover:text-white">
              spoiler
            </summary>
            <span>{renderTokens(tok.children, key)}</span>
          </details>
        );
    }
  });
}

export function VndbMarkup({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  if (!text) return null;
  const tokens = tokenize(text);
  return <span className={className}>{renderTokens(tokens)}</span>;
}

/**
 * Plain-text strip — same parser, renders only the visible label.
 * Use this where you previously regexed out BBCode (filter chips,
 * search snippets, etc.) so every site shares one parser.
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
        out += tok.label || tok.href;
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
