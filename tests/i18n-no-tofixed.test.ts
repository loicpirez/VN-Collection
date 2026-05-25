import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (path.endsWith('/src/app/api')) continue;
      yield* walk(path);
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      yield path;
    }
  }
}

describe('locale-aware numeric formatting', () => {
  it('does not use toFixed in app pages or components', () => {
    const offenders: string[] = [];
    for (const base of [join(ROOT, 'src/app'), join(ROOT, 'src/components')]) {
      for (const path of walk(base)) {
        const src = readFileSync(path, 'utf8');
        if (src.includes('.toFixed(')) {
          offenders.push(path.slice(ROOT.length + 1));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
