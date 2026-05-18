#!/usr/bin/env node
/**
 * R5-148 one-shot sweep: rewrite every
 *   (await req.json().catch(() => ({})))
 * into
 *   (await readJsonObject(req))
 * and add the import if missing.
 *
 * `readJsonObject` (src/lib/api-body.ts) closes the
 * `body = null` and `body = []` gaps that `.catch(() => ({}))`
 * doesn't handle.
 *
 * Idempotent: re-running on a swept file is a no-op.
 *
 * Run from repo root:  node scripts/sweep-readjsonobject.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

const grep = execSync(
  `grep -rlE "await req\\.json\\(\\)\\.catch\\(\\(\\) => \\(\\{\\}\\)\\)" src/app/api/`,
  { cwd: ROOT, encoding: 'utf8' },
).trim().split('\n').filter(Boolean);

let totalReplaced = 0;
let filesChanged = 0;

for (const rel of grep) {
  const path = join(ROOT, rel);
  const orig = readFileSync(path, 'utf8');
  let next = orig;

  // Match the exact "(await req.json().catch(() => ({})))" shape.
  const pattern = /\(await req\.json\(\)\.catch\(\(\)\s*=>\s*\(\{\}\)\)\)/g;
  const before = (orig.match(pattern) || []).length;
  next = next.replace(pattern, '(await readJsonObject(req))');
  if (next === orig) continue;

  if (!/from\s+['"]@\/lib\/api-body['"]/.test(next)) {
    const importLines = [...next.matchAll(/^import[^;]*;\s*$/gm)];
    if (importLines.length > 0) {
      const lastImport = importLines[importLines.length - 1];
      const insertAt = lastImport.index + lastImport[0].length;
      next = next.slice(0, insertAt) + `\nimport { readJsonObject } from '@/lib/api-body';` + next.slice(insertAt);
    } else {
      next = `import { readJsonObject } from '@/lib/api-body';\n` + next;
    }
  }

  writeFileSync(path, next);
  totalReplaced += before;
  filesChanged += 1;
  console.log(`  ${relative(ROOT, path)}  (-${before} unsafe req.json())`);
}

console.log(`\nR5-148 sweep: ${filesChanged} files, ${totalReplaced} unsafe req.json() sites rewritten.`);
