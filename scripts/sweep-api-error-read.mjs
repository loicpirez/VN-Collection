#!/usr/bin/env node
/**
 * R5-147 one-shot sweep: rewrite every
 *   `(await r.json().catch(() => ({}))).error || <fallback>`
 *   `(await response.json().catch(() => ({}))).error || <fallback>`
 * into
 *   `await readApiError(r, <fallback>)`
 *   `await readApiError(response, <fallback>)`
 * and add the import if missing.
 *
 * Idempotent: re-running on a swept file is a no-op (the
 * regex won't match the new shape).
 *
 * Run from repo root:  node scripts/sweep-api-error-read.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

const grep = execSync(
  `grep -rlE "await [a-zA-Z_]+\\.json\\(\\)\\.catch\\(\\(\\) => \\(\\{\\}\\)\\)\\)\\.error" src/`,
  { cwd: ROOT, encoding: 'utf8' },
).trim().split('\n').filter(Boolean);

let totalReplaced = 0;
let filesChanged = 0;

for (const rel of grep) {
  const path = join(ROOT, rel);
  const orig = readFileSync(path, 'utf8');
  let next = orig;

  // Match:
  //   (await <ident>.json().catch(() => ({}))).error || <fallback>
  // where <ident> is the Response variable name (typically `r`,
  // `res`, `response`, `resp`) and <fallback> is any expression
  // that stops at the closing paren / brace / comma / semicolon
  // bounding the throw statement.
  //
  // The replacement reads:
  //   await readApiError(<ident>, <fallback>)
  const pattern = /\(await\s+([a-zA-Z_][a-zA-Z_0-9]*)\.json\(\)\.catch\(\(\)\s*=>\s*\(\{\}\)\)\)\.error\s*\|\|\s*([^)]+?)(?=\s*[;)])/g;
  let replacements = 0;
  next = next.replace(pattern, (_match, ident, fallback) => {
    replacements++;
    return `await readApiError(${ident}, ${fallback.trim()})`;
  });
  if (next === orig) continue;

  // Add the import if not already present.
  if (!/from\s+['"]@\/lib\/api-error-read['"]/.test(next)) {
    // Insert after the LAST top-level `import ... from '...';` line
    // so the new import lands at the bottom of the import block.
    // Falls back to file head if there are no imports.
    const importLines = [...next.matchAll(/^import[^;]*;\s*$/gm)];
    if (importLines.length > 0) {
      const lastImport = importLines[importLines.length - 1];
      const insertAt = lastImport.index + lastImport[0].length;
      next = next.slice(0, insertAt) + `\nimport { readApiError } from '@/lib/api-error-read';` + next.slice(insertAt);
    } else {
      next = `import { readApiError } from '@/lib/api-error-read';\n` + next;
    }
  }

  writeFileSync(path, next);
  totalReplaced += replacements;
  filesChanged += 1;
  console.log(`  ${relative(ROOT, path)}  (-${replacements} untyped json().error)`);
}

console.log(`\nR5-147 sweep: ${filesChanged} files, ${totalReplaced} untyped json().error sites rewritten.`);
