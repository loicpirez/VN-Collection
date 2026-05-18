#!/usr/bin/env node
/**
 * R5-129 one-shot sweep: rewrite every
 *   `return NextResponse.json({ error: (err as Error).message }, { status: 502 });`
 * (and the equivalent `(e as Error)` variant) into
 *   `return upstreamError('<route-label>', err);`
 * and add the import if missing.
 *
 * Idempotent: re-running on a swept file is a no-op (the
 * regex won't match the new shape).
 *
 * Run from repo root:  node scripts/sweep-upstream-error.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

// Find all source files matching the leaky pattern.
const grep = execSync(
  `grep -rlE "NextResponse\\.json\\(\\s*\\{\\s*error:\\s*\\((err|e) as Error\\)\\.message" src/`,
  { cwd: ROOT, encoding: 'utf8' },
).trim().split('\n').filter(Boolean);

function routeLabelFromPath(rel) {
  // src/app/api/foo/bar/route.ts -> foo/bar
  // src/app/api/vn/[id]/quotes/route.ts -> vn/[id]/quotes
  const m = rel.match(/^src\/app\/api\/(.+)\/route\.ts$/);
  if (m) return m[1];
  return rel.replace(/^src\//, '').replace(/\.ts$/, '');
}

let totalReplaced = 0;
let filesChanged = 0;

for (const rel of grep) {
  const path = join(ROOT, rel);
  const orig = readFileSync(path, 'utf8');
  let next = orig;

  // 1) Replace the catch-block return shape. Two variants observed:
  //    a) `return NextResponse.json({ error: (err as Error).message }, { status: 502 });`
  //    b) `return NextResponse.json({ error: (e as Error).message }, { status: 502 });`
  // The regex captures the identifier so we keep using it in the call.
  const label = routeLabelFromPath(rel);
  next = next.replace(
    /return NextResponse\.json\(\s*\{\s*error:\s*\((err|e) as Error\)\.message\s*\},?\s*\{\s*status:\s*502\s*,?\s*\}\s*\);/g,
    (_match, id) => `return upstreamError('${label}', ${id});`,
  );
  if (next === orig) continue;

  // Count replacements for the report.
  const before = (orig.match(/return NextResponse\.json\(\s*\{\s*error:\s*\((err|e) as Error\)/g) || []).length;
  const after = (next.match(/return NextResponse\.json\(\s*\{\s*error:\s*\((err|e) as Error\)/g) || []).length;
  const swept = before - after;

  // 2) Add the import if not already present.
  if (!/from\s+['"]@\/lib\/api-error['"]/.test(next)) {
    // Insert after the existing NextResponse import (every leaky route has one)
    next = next.replace(
      /(import\s*\{[^}]*NextResponse[^}]*\}\s*from\s*['"]next\/server['"]\s*;\s*\n)/,
      `$1import { upstreamError } from '@/lib/api-error';\n`,
    );
  }

  writeFileSync(path, next);
  totalReplaced += swept;
  filesChanged += 1;
  console.log(`  ${relative(ROOT, path)}  (-${swept} leaky 502)`);
}

console.log(`\nR5-129 sweep: ${filesChanged} files, ${totalReplaced} leaky 502 sites rewritten.`);
