import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const TYPES = readFileSync('src/lib/types.ts', 'utf8');
const DB = readFileSync('src/lib/db.ts', 'utf8');
const LIBRARY = readFileSync('src/components/LibraryClient.tsx', 'utf8');
const ROUTE = readFileSync('src/app/api/collection/route.ts', 'utf8');

describe('collection card DTO boundaries', () => {
  it('defines separate database-card and public API DTOs', () => {
    expect(TYPES).toContain('export type CollectionCardItem =');
    expect(TYPES).toContain('export type CollectionCardApiItem =');
    expect(TYPES).toContain("type PrivateCollectionCardField =");
  });

  it('returns the exact slim projection from listCollectionForCards', () => {
    expect(DB).toMatch(/listCollectionForCards\(opts: ListOptions = \{\}\): CollectionCardItem\[\]/);
    expect(DB).toContain('...cardItem');
  });

  it('uses the public card DTO in the library client', () => {
    expect(LIBRARY).toContain('items: CollectionCardApiItem[];');
    expect(LIBRARY).not.toContain('items: CollectionItem[];');
  });

  it('exposes only the central AI duration on public card rows', () => {
    expect(TYPES).toContain("| 'ai_playtime';");
    expect(TYPES).toContain('ai_playtime_minutes: number | null;');
    expect(ROUTE).toContain('ai_playtime_minutes: ai_playtime?.minutes ?? null');
    expect(ROUTE).toMatch(/custom_description,\s+ai_playtime,\s+\.\.\.libraryItem/s);
  });
});
