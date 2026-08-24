import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const API_ROOT = join(process.cwd(), 'src/app/api');
const METHOD_PATTERN = /export\s+(?:async\s+)?function\s+(GET|POST|PATCH|DELETE|PUT)\b/g;

interface RoutePolicyResult {
  file: string;
  methods: string[];
  publicGetWithoutMarker: boolean;
  mutationWithoutGate: boolean;
  dbRouteWithoutNodeRuntime: boolean;
}

function routeFiles(dir: string = API_ROOT): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === 'route.ts' ? [path] : [];
  });
}

function exportedMethods(source: string): string[] {
  return Array.from(source.matchAll(METHOD_PATTERN), (match) => match[1]);
}

function inspectRoute(file: string): RoutePolicyResult {
  const source = readFileSync(file, 'utf8');
  const methods = exportedMethods(source);
  const hasPublicMarker = source.includes('PUBLIC_READ_ROUTE') && source.includes('void PUBLIC_READ_ROUTE');
  const hasGate = source.includes('requireLocalhostOrToken');
  const touchesDb = source.includes('@/lib/db');
  const pinsNodeRuntime = /export\s+const\s+runtime\s*=\s*['"]nodejs['"]/.test(source);
  return {
    file,
    methods,
    publicGetWithoutMarker: methods.includes('GET') && !hasGate && !hasPublicMarker,
    mutationWithoutGate: methods.some((method) => method !== 'GET') && !hasGate,
    dbRouteWithoutNodeRuntime: touchesDb && !pinsNodeRuntime,
  };
}

describe('API route policy', () => {
  it('documents public reads, gates mutations, and pins DB routes to nodejs', () => {
    const violations = routeFiles()
      .map(inspectRoute)
      .filter((result) =>
        result.publicGetWithoutMarker
        || result.mutationWithoutGate
        || result.dbRouteWithoutNodeRuntime,
      )
      .map((result) => `${result.file} [${result.methods.join(',') || 'no exported method'}]`);

    expect(violations).toEqual([]);
  });
});
