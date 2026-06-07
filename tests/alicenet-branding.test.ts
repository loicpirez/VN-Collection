import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const LEGACY_IDENTIFIER_RE = /alicesoft[_-]kobe|alice_kobe|ALICESOFT_KOBE|ALICE_KOBE|\bkobe\b|\bKobe\b/;
const UPSTREAM_HOST = 'alice-kobe.com';
const LEGACY_MIGRATION_INPUTS = [
  'alicesoft_kobe_stock',
  'alice_kobe_stock',
  'alicesoft_kobe_proxy_config',
  'alice_kobe_proxy_config',
  'alicesoft_kobe_last_fetch',
  'alice_kobe_last_fetch',
  'alicesoft_kobe',
  'alice_kobe',
  'kobe.link',
];

function source(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function filesUnder(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

function withoutAllowedHost(text: string): string {
  return text.replaceAll(UPSTREAM_HOST, 'upstream.example');
}

describe('AliceNet branding', () => {
  it('uses canonical filenames for stock-browser source and tests', () => {
    const files = [...filesUnder(join(ROOT, 'src')), ...filesUnder(join(ROOT, 'tests'))]
      .map((path) => relative(ROOT, path))
      .filter((path) => LEGACY_IDENTIFIER_RE.test(path));
    expect(files).toEqual([]);
    expect(existsSync(join(ROOT, 'src/app/alicenet/page.tsx'))).toBe(false);
    expect(source('src/components/StockLookupClient.tsx')).toContain('<AliceNetClient embedded basePath="/stock" />');
    expect(existsSync(join(ROOT, 'src/components/AliceNetClient.tsx'))).toBe(true);
    expect(existsSync(join(ROOT, 'src/lib/alicenet.ts'))).toBe(true);
  });

  it('keeps runtime source and canonical docs free of legacy identifiers', () => {
    const files = [
      ...filesUnder(join(ROOT, 'src')).filter((path) => relative(ROOT, path) !== 'src/lib/db.ts'),
      join(ROOT, 'README.md'),
      join(ROOT, 'FEATURES.md'),
      join(ROOT, 'CLAUDE.md'),
    ];
    for (const path of files) {
      expect(withoutAllowedHost(readFileSync(path, 'utf8')), relative(ROOT, path)).not.toMatch(LEGACY_IDENTIFIER_RE);
    }
  });

  it('isolates prior persisted identifiers to the forward migration', () => {
    let dbSource = source('src/lib/db.ts');
    for (const identifier of LEGACY_MIGRATION_INPUTS) {
      expect(dbSource).toContain(identifier);
      dbSource = dbSource.replaceAll(identifier, '');
    }
    expect(dbSource).not.toMatch(LEGACY_IDENTIFIER_RE);
  });

  it('documents and configures canonical identifiers', () => {
    for (const path of ['README.md', 'FEATURES.md', 'CLAUDE.md']) {
      const text = source(path);
      expect(text, path).toContain('AliceNet');
      expect(text, path).toContain('/stock');
      expect(text, path).toContain('/api/alicenet/*');
      expect(text, path).toContain('alicenet_*');
      expect(text, path).not.toContain('ALICENET_ENABLED');
      expect(text, path).not.toContain('ALICENET_PROXY');
    }
    const proxyConfig = source('src/lib/proxy-config.ts');
    expect(proxyConfig).toContain("if (provider === ALICENET_PROVIDER_ID) return null");
    expect(proxyConfig).toContain("if (providerId === ALICENET_PROVIDER_ID)");
    expect(proxyConfig).toContain("return resolveFromStored(null, readDbConfig('stock'))");
    expect(proxyConfig).not.toContain("alicenet: 'ALICENET'");
  });
});
