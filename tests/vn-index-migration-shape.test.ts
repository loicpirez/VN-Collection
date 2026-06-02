import { describe, expect, it } from 'vitest';
import {
  decodeMigratableProducerIds,
  decodeMigratableStaffCredits,
  decodeMigratableStringValues,
  decodeMigratableTagIndexRows,
  decodeMigratableVaCredits,
  decodeStaffCreditIndexPayload,
} from '@/lib/vn-index-migration-shape';

describe('VN index migration JSON decoders', () => {
  it('normalizes valid historical credit rows and skips malformed members', () => {
    expect(decodeMigratableStaffCredits(JSON.stringify([
      { id: 'S90001', aid: 2, eid: 3, role: 'scenario', note: null, name: 'Staff', original: null, lang: 'ja' },
      { id: 'bad', name: 'Ignored' },
    ]))).toEqual([
      { id: 's90001', aid: 2, eid: 3, role: 'scenario', note: null, name: 'Staff', original: null, lang: 'ja' },
    ]);
    expect(decodeMigratableVaCredits(JSON.stringify([
      {
        note: null,
        character: { id: 'C90001', name: 'Character', original: null, image: { url: 'https://example.invalid/c.jpg' } },
        staff: { id: 'S90001', aid: 2, name: 'Staff', original: null, lang: 'ja' },
      },
      { character: {}, staff: {} },
    ]))).toEqual([
      {
        note: null,
        character: { id: 'c90001', name: 'Character', original: null, imageUrl: 'https://example.invalid/c.jpg' },
        staff: { id: 's90001', aid: 2, name: 'Staff', original: null, lang: 'ja' },
      },
    ]);
  });

  it('rejects invalid migration containers before an index rebuild', () => {
    expect(decodeMigratableStaffCredits('{}')).toBeNull();
    expect(decodeMigratableVaCredits('{}')).toBeNull();
    expect(decodeMigratableTagIndexRows('{}')).toBeNull();
    expect(decodeMigratableProducerIds('{}')).toBeNull();
    expect(decodeMigratableStringValues('{}')).toBeNull();
    expect(decodeMigratableStringValues(JSON.stringify(Array.from({ length: 5001 }, () => 'ja')))).toBeNull();
  });

  it('projects valid tag, producer, and scalar index rows', () => {
    expect(decodeMigratableTagIndexRows(JSON.stringify([
      { id: 'G90001', name: '', spoiler: 1, category: 'cont' },
      { id: 'bad' },
    ]))).toEqual([{ id: 'g90001', name: 'g90001', spoiler: 1, category: 'cont' }]);
    expect(decodeMigratableProducerIds(JSON.stringify([{ id: 'P90001' }, { id: 'bad' }]))).toEqual(['p90001']);
    expect(decodeMigratableStringValues(JSON.stringify(['ja', 1, '', 'en']))).toEqual(['ja', 'en']);
  });

  it('extracts only canonical VN ids from a usable staff full-cache envelope', () => {
    expect(decodeStaffCreditIndexPayload(JSON.stringify({
      productionCredits: [{ id: 'V90001' }, { id: 'bad' }],
      vaCredits: [{ id: 'v90002' }, {}],
    }))).toEqual({ productionIds: ['v90001'], vaIds: ['v90002'] });
    expect(decodeStaffCreditIndexPayload(JSON.stringify({ productionCredits: {}, vaCredits: [] }))).toBeNull();
    expect(decodeStaffCreditIndexPayload(JSON.stringify({ productionCredits: [] }))).toBeNull();
  });

  it('handles absent, malformed, and sparse historical rows', () => {
    expect(decodeMigratableStringValues(null)).toEqual([]);
    expect(decodeMigratableStringValues('[')).toBeNull();
    expect(decodeMigratableStaffCredits(JSON.stringify([
      { id: 'S90002', name: 'Sparse staff' },
      { id: 'S90003', name: 'Detailed staff', note: 'Credit note', original: 'Original name' },
    ]))).toEqual([
      { id: 's90002', aid: null, eid: null, role: '', note: null, name: 'Sparse staff', original: null, lang: null },
      { id: 's90003', aid: null, eid: null, role: '', note: 'Credit note', name: 'Detailed staff', original: 'Original name', lang: null },
    ]);
    expect(decodeMigratableVaCredits(JSON.stringify([
      {
        note: 'Lead',
        character: { id: 'C90002', name: 'Character', original: 'Original', image: null },
        staff: { id: 'S90002', aid: null, name: 'Staff', original: 'Original staff', lang: null },
      },
      {
        character: { id: 'C90003', name: 'Sparse character' },
        staff: { id: 'S90003', name: 'Sparse staff' },
      },
    ]))).toEqual([
      {
        note: 'Lead',
        character: { id: 'c90002', name: 'Character', original: 'Original', imageUrl: null },
        staff: { id: 's90002', aid: null, name: 'Staff', original: 'Original staff', lang: null },
      },
      {
        note: null,
        character: { id: 'c90003', name: 'Sparse character', original: null, imageUrl: null },
        staff: { id: 's90003', aid: null, name: 'Sparse staff', original: null, lang: null },
      },
    ]);
    expect(decodeMigratableTagIndexRows(JSON.stringify([
      { id: 'G90002', name: 'Named' },
    ]))).toEqual([{ id: 'g90002', name: 'Named', spoiler: 0, category: null }]);
  });
});
