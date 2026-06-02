import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function walkTsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkTsx(path);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [path] : [];
  });
}

function localLucideNames(source: string): string[] {
  return Array.from(source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g))
    .flatMap((match) => match[1].split(','))
    .map((spec) => spec.trim())
    .filter(Boolean)
    .map((spec) => spec.match(/^(\w+)\s+as\s+(\w+)$/)?.[2] ?? spec);
}

describe('Lucide decorative icon contract', () => {
  it('hides self-closing Lucide instances from duplicate assistive output', () => {
    for (const path of [...walkTsx('src/app'), ...walkTsx('src/components')]) {
      const body = readFileSync(path, 'utf8');
      for (const name of localLucideNames(body)) {
        const uses = body.match(new RegExp(`<${name}(?:\\s[^<>]*?)?\\s*/>`, 'g')) ?? [];
        for (const use of uses) {
          expect(use, `${path}: ${use}`).toMatch(/\baria-hidden(?:=|\s|\/>)/);
        }
      }
    }
  });
});
