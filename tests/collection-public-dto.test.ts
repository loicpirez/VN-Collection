import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/collection/route';
import { addToCollection, upsertVn } from '@/lib/db';

describe('GET /api/collection card DTO', () => {
  it('reports note presence without returning private annotation fields', async () => {
    const id = 'v90110';
    upsertVn({ id, title: 'Fixture' });
    addToCollection(id, {
      notes: 'private note',
      started_date: '2026-01-01',
      finished_date: '2026-01-02',
      location: 'jp',
      edition_label: 'private edition',
      box_type: 'large',
      download_url: 'https://example.com/private',
    });
    const res = await GET(new NextRequest('http://localhost/api/collection'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };
    const item = body.items.find((row) => row.id === id);
    expect(item).toBeDefined();
    expect(item).toMatchObject({ id, has_notes: true });
    expect(item).not.toHaveProperty('notes');
    expect(item).not.toHaveProperty('started_date');
    expect(item).not.toHaveProperty('finished_date');
    expect(item).not.toHaveProperty('location');
    expect(item).not.toHaveProperty('edition_label');
    expect(item).not.toHaveProperty('box_type');
    expect(item).not.toHaveProperty('download_url');
    expect(item).not.toHaveProperty('custom_description');
  });
});
