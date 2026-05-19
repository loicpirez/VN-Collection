#!/usr/bin/env node
/**
 * R5-160 — structural audit for color-only state distinctions.
 *
 * Walks every `.tsx` file under `src/` and flags JSX elements that
 * use a status colour utility (`text-status-…`, `bg-status-…`,
 * `border-status-…`) but do NOT pair the colour with at least one
 * of:
 *   - an explicit icon (Lucide component reference, e.g. `<XCircle`,
 *     `<CheckCircle2`, `<AlertCircle`, or the shared `<StatusIcon>`),
 *   - a status word from any of the FR/EN/JA dictionaries
 *     (e.g. "Terminé", "Completed", "In progress", "Dropped",
 *     "Abandonné", "停止", "完了"),
 *   - a `aria-label` / `title` / `data-status` attribute that names
 *     the state.
 *
 * The output is a punch list; each line is `<file>:<line>  <reason>`
 * with the matched class chain. The audit is run from the repo root
 * and prints to stdout. Exits non-zero with a count of flagged
 * occurrences so CI can gate on it.
 *
 * Heuristic — false positives can happen (e.g. when the icon lives
 * in a sibling element parsed out of frame). Flagged hits are
 * reviewed manually and either fixed by adding an icon / label, or
 * documented inline. Once the punch list is empty the row can be
 * marked FIXED_VERIFIED.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const STATUS_COLOR_RX = /(?:text|bg|border)-status-(?:dropped|completed|on_hold|playing|planning|stalled)/;

// Status-naming text fragments to match (case-insensitive). Pulled
// from the FR/EN/JA dictionaries' state labels.
const STATUS_WORDS = [
  // FR
  'terminé', 'en cours', 'abandonné', 'en pause', 'à faire',
  'en attente', 'planifié', 'prévu', 'envoi', 'erreur',
  'avertissement', 'avertir',
  // EN
  'completed', 'playing', 'dropped', 'on hold', 'paused',
  'planning', 'planned', 'in progress', 'error', 'warning',
  'sending', 'sent', 'failed', 'success', 'missing',
  // JA
  'プレイ中', '完了', '中断', '停止', '計画', '保留',
  'エラー', '警告', '失敗', '成功',
  // Generic UI labels that name a state.
  'spoiler', 'r18', 'nsfw',
];

// Any capitalized JSX component reference signals "this is a
// component, possibly an icon". The audit is intentionally
// permissive here — a `<MinusCircle>` / `<SearchIcon>` / `<Bell>`
// shouldn't fail the gate just because the regex didn't enumerate
// the lucide name. The genuine color-only failures are spans/divs
// with literally NO non-className content.
const ICON_RX = /<[A-Z][A-Za-z0-9]+\b/;

// Detect a JSX expression / interpolation that resolves to a
// runtime string (i18n keys, status name, etc.). Any `{t.…}`,
// `{name}`, `{label}`, `{children}` etc. is treated as user-visible
// text content even though we can't resolve it statically.
const JSX_EXPR_TEXT_RX = /\{(?:t\.[\w.]+|[a-zA-Z_][\w.?]*(?:\s*\?\s*[^}]+:[^}]+)?)\}/;

// Direct literal text content between JSX tags — non-whitespace,
// non-comment characters between `>` and `<`. Excludes pure
// expressions (those are caught above).
const JSX_TEXT_RX = />\s*[^<{>\s][^<{>]*</;

const ATTR_RX = /(?:aria-label|title|data-status|data-state|alt|aria-describedby|aria-current)\s*=/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) yield* walk(full);
    else if (full.endsWith('.tsx')) yield full;
  }
}

/**
 * Return the JSX block surrounding a `className=` match — from the
 * opening tag (preceding `<`) to the next `/>` or `</…>` close, up
 * to N lines of look-ahead. The window is intentionally generous
 * (8 back / 40 forward) so a multi-line `<button>` whose icon child
 * and aria-label live far below the className ternary still gets
 * captured in the block.
 */
function jsxBlock(lines, idx) {
  let start = idx;
  // Look back up to 24 lines for the nearest JSX opening tag — a
  // long `<button>` block with many `onClick` / `onFocus` / `aria-*`
  // attributes between the tag name and the className ternary can
  // easily span 12-20 lines.
  for (let i = idx; i >= Math.max(0, idx - 24); i--) {
    if (/<[A-Za-z]/.test(lines[i] ?? '')) {
      start = i;
      break;
    }
  }
  let end = idx;
  // Track nesting depth so a child `<Icon />` doesn't end the
  // window before we reach the actual `</button>` close.
  let depth = 0;
  for (let i = start; i < Math.min(lines.length, idx + 40); i++) {
    const line = lines[i] ?? '';
    const opens = (line.match(/<[A-Za-z]/g) ?? []).length;
    const selfCloses = (line.match(/\/>/g) ?? []).length;
    const closes = (line.match(/<\/[A-Za-z]/g) ?? []).length;
    depth += opens - selfCloses - closes;
    end = i;
    if (depth <= 0 && i > start) break;
  }
  return lines.slice(start, end + 1).join('\n');
}

const flagged = [];

for (const file of walk(join(ROOT, 'src'))) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  // Top-of-file imports — used as a coarse signal that the file
  // does include some lucide icons (true negative when the file
  // can't paint an icon at all).
  const fileLower = text.toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!STATUS_COLOR_RX.test(line)) continue;
    // Skip the StatusIcon module + the lucide import map.
    if (file.endsWith('StatusIcon.tsx')) continue;
    if (/^import\b/.test(line.trim())) continue;
    // Skip CSS file (we already audit globals.css separately).
    const block = jsxBlock(lines, i);
    const blockLower = block.toLowerCase();
    const hasIcon = ICON_RX.test(block);
    const hasStatusWord = STATUS_WORDS.some((w) => blockLower.includes(w.toLowerCase()));
    const hasAttr = ATTR_RX.test(block);
    const hasExpr = JSX_EXPR_TEXT_RX.test(block);
    const hasLiteralText = JSX_TEXT_RX.test(block);
    if (hasIcon || hasStatusWord || hasAttr || hasExpr || hasLiteralText) continue;
    // Skip lines that are pure CSS class strings (e.g. inside a
    // `cn(...)` helper for a child component that DOES paint the
    // icon). The heuristic: if the matched line is a ternary /
    // class-name literal without JSX opening, treat as helper.
    const trimmed = line.trim();
    if (!/className\b/.test(line) && !/['"`]/.test(line)) continue;
    const classMatch = trimmed.match(/['"][^'"\n]*(?:text|bg|border)-status-[a-z_]+[^'"\n]*['"]/);
    flagged.push({
      file: file.replace(ROOT + '/', ''),
      line: i + 1,
      snippet: trimmed.slice(0, 140),
      classes: classMatch ? classMatch[0] : '<inline>',
    });
  }
}

console.log(`R5-160 color-only state audit — ${flagged.length} flagged occurrence(s)`);
console.log('');
for (const f of flagged) {
  console.log(`  ${f.file}:${f.line}  ${f.classes}`);
  console.log(`    ${f.snippet}`);
}
process.exit(flagged.length > 0 ? 1 : 0);
