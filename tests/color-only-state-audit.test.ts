/**
 * R5-160 — pins the structural audit that every `text-status-…` /
 * `bg-status-…` / `border-status-…` JSX element pairs the colour
 * signal with at least one of:
 *   - an icon child (any capitalized JSX component reference),
 *   - a status-naming text fragment (FR/EN/JA dictionary words),
 *   - an aria-label / title / data-status / data-state / alt /
 *     aria-describedby / aria-current attribute,
 *   - a runtime JSX expression child (`{t.foo.bar}`, `{label}`),
 *   - any literal text content between the JSX tags.
 *
 * This is the same scan `scripts/r5-160-color-only-state-audit.mjs`
 * runs; the script is for ad-hoc audits, this test is the CI gate.
 * If a future PR lands a color-only chip, the test fails with the
 * file:line of the offender.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const STATUS_COLOR_RX = /(?:text|bg|border)-status-(?:dropped|completed|on_hold|playing|planning|stalled)/;
const ICON_RX = /<[A-Z][A-Za-z0-9]+\b/;
const JSX_EXPR_TEXT_RX = /\{(?:t\.[\w.]+|[a-zA-Z_][\w.?]*(?:\s*\?\s*[^}]+:[^}]+)?)\}/;
const JSX_TEXT_RX = />\s*[^<{>\s][^<{>]*</;
const ATTR_RX = /(?:aria-label|title|data-status|data-state|alt|aria-describedby|aria-current)\s*=/;

const STATUS_WORDS = [
  'terminé', 'en cours', 'abandonné', 'en pause', 'à faire',
  'en attente', 'planifié', 'prévu', 'envoi', 'erreur',
  'avertissement', 'avertir',
  'completed', 'playing', 'dropped', 'on hold', 'paused',
  'planning', 'planned', 'in progress', 'error', 'warning',
  'sending', 'sent', 'failed', 'success', 'missing',
  'プレイ中', '完了', '中断', '停止', '計画', '保留',
  'エラー', '警告', '失敗', '成功',
  'spoiler', 'r18', 'nsfw',
];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) yield* walk(full);
    else if (full.endsWith('.tsx')) yield full;
  }
}

function jsxBlock(lines: string[], idx: number): string {
  let start = idx;
  for (let i = idx; i >= Math.max(0, idx - 24); i--) {
    if (/<[A-Za-z]/.test(lines[i] ?? '')) {
      start = i;
      break;
    }
  }
  let end = idx;
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

interface Hit {
  file: string;
  line: number;
  classes: string;
}

function audit(): Hit[] {
  const hits: Hit[] = [];
  for (const file of walk(join(ROOT, 'src'))) {
    if (file.endsWith('StatusIcon.tsx')) continue;
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (!STATUS_COLOR_RX.test(line)) continue;
      if (/^\s*import\b/.test(line)) continue;
      const block = jsxBlock(lines, i);
      const blockLower = block.toLowerCase();
      const hasIcon = ICON_RX.test(block);
      const hasWord = STATUS_WORDS.some((w) => blockLower.includes(w.toLowerCase()));
      const hasAttr = ATTR_RX.test(block);
      const hasExpr = JSX_EXPR_TEXT_RX.test(block);
      const hasLiteralText = JSX_TEXT_RX.test(block);
      if (hasIcon || hasWord || hasAttr || hasExpr || hasLiteralText) continue;
      const cm = line.trim().match(/['"][^'"\n]*(?:text|bg|border)-status-[a-z_]+[^'"\n]*['"]/);
      hits.push({
        file: file.replace(ROOT + '/', ''),
        line: i + 1,
        classes: cm ? cm[0] : '<inline>',
      });
    }
  }
  return hits;
}

describe('R5-160 — no color-only state distinctions across src/', () => {
  it('every status-coloured JSX element pairs the colour with an icon / label / text', () => {
    const hits = audit();
    expect(
      hits,
      hits.length
        ? `R5-160 violations — pair each colour with an icon or accessible label:\n${hits
            .map((h) => `  ${h.file}:${h.line}  ${h.classes}`)
            .join('\n')}`
        : 'no color-only hits',
    ).toEqual([]);
  });
});
