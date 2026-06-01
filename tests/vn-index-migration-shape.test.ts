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
});
