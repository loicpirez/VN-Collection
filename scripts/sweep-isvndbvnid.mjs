#!/usr/bin/env node
/**
 * R5-120 one-shot sweep: rewrite every inline
 *   /^v\d+$/i.test(<ident>)
 *   /^v\d+$/.test(<ident>)
 * into
 *   isVndbVnId(<ident>)
 * and add the import if missing.
 *
 * Idempotent: re-running on a swept file is a no-op.
 *
 * Run from repo root:  node scripts/sweep-isvndbvnid.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

const grep = execSync(
  `grep -rlE "/\\^v\\\\\\\\d\\\\+\\\\\\$/i?\\\\.test\\\\(" src/`,
  { cwd: ROOT, encoding: 'utf8' },
).trim().split('\n').filter(Boolean);

let totalReplaced = 0;
let filesChanged = 0;

for (const rel of grep) {
  // Don't sweep the helper module itself.
  if (rel === 'src/lib/vn-id.ts') continue;
  const path = join(ROOT, rel);
  const orig = readFileSync(path, 'utf8');
  let next = orig;

  const before =
    (orig.match(/\/\^v\\d\+\$\/i?\.test\(/g) || []).length;
  next = next.replace(/\/\^v\\d\+\$\/i?\.test\(/g, 'isVndbVnId(');
  if (next === orig) continue;

  if (!/from\s+['"]@\/lib\/vn-id['"]/.test(next)) {
    const importLines = [...next.matchAll(/^import[^;]*;\s*$/gm)];
    if (importLines.length > 0) {
      const lastImport = importLines[importLines.length - 1];
      const insertAt = lastImport.index + lastImport[0].length;
      next = next.slice(0, insertAt) + `\nimport { isVndbVnId } from '@/lib/vn-id';` + next.slice(insertAt);
    } else {
      next = `import { isVndbVnId } from '@/lib/vn-id';\n` + next;
    }
  } else {
    // The file already imports something from vn-id — extend the
    // existing destructured import if `isVndbVnId` isn't already
    // in the list.
    if (!/\{[^}]*\bisVndbVnId\b[^}]*\}\s*from\s*['"]@\/lib\/vn-id['"]/.test(next)) {
      next = next.replace(
        /import\s*\{\s*([^}]*)\s*\}\s*from\s*(['"]@\/lib\/vn-id['"])/,
        (_m, inner, src) => `import { ${inner.trim().replace(/,?\s*$/, '')}, isVndbVnId } from ${src}`,
      );
    }
  }

  writeFileSync(path, next);
  totalReplaced += before;
  filesChanged += 1;
  console.log(`  ${relative(ROOT, path)}  (-${before} inline /^v\\d+$/ regex)`);
}

console.log(`\nR5-120 sweep: ${filesChanged} files, ${totalReplaced} inline /^v\\d+$/ test sites rewritten.`);
