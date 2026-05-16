import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import {
  clearEgsVnLink,
  clearVnEgsLink,
  db,
  getEgsVnLink,
  getVnEgsLink,
  listAllEgsVnLinks,
  setEgsVnLink,
  setVnEgsLink,
} from '../src/lib/db';
import { applyManualEgsToVndb } from '../src/lib/erogamescape';

describe('manual EGS <-> VNDB mapping helpers', () => {
  beforeAll(() => {
    // The vn_egs_link table FK-references vn(id) ON DELETE CASCADE.
    // Seed minimal vn rows so the upsert succeeds.
    const ins = db.prepare(
      `INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)`,
    );
    ins.run('v999', 'Fake VN 999', Date.now());
    ins.run('v1000', 'Fake VN 1000', Date.now());
  });

  beforeEach(() => {
    clearVnEgsLink('v999');
    clearVnEgsLink('v1000');
    clearEgsVnLink(9000);
    clearEgsVnLink(9001);
    clearEgsVnLink(9002);
  });

  describe('vn_egs_link', () => {
    it('round-trips a pin', () => {
      setVnEgsLink('v999', 42);
      const got = getVnEgsLink('v999');
      expect(got?.vn_id).toBe('v999');
      expect(got?.egs_id).toBe(42);
      expect(typeof got?.updated_at).toBe('number');
    });

    it('preserves the "no EGS counterpart" pin', () => {
      setVnEgsLink('v999', null, 'confirmed no match');
      const got = getVnEgsLink('v999');
      expect(got?.egs_id).toBeNull();
      expect(got?.note).toBe('confirmed no match');
    });

    it('upserts on conflict (replaces prior pin)', () => {
      setVnEgsLink('v999', 1);
      setVnEgsLink('v999', 2);
      const got = getVnEgsLink('v999');
      expect(got?.egs_id).toBe(2);
    });

    it('clear removes the row entirely', () => {
      setVnEgsLink('v999', 1);
      clearVnEgsLink('v999');
      expect(getVnEgsLink('v999')).toBeNull();
    });

    it('rejects malformed vn id and egs id', () => {
      // Validation happens before the SQL prepare, so no FK fallout.
      expect(() => setVnEgsLink('notavn', 1)).toThrow(/invalid vn/);
      expect(() => setVnEgsLink('v999', -1)).toThrow(/invalid egs/);
      expect(() => setVnEgsLink('v999', 0)).toThrow(/invalid egs/);
      expect(() => setVnEgsLink('v999', 1.5)).toThrow(/invalid egs/);
    });
  });

  describe('egs_vn_link', () => {
    it('round-trips a pin', () => {
      setEgsVnLink(9000, 'v123');
      const got = getEgsVnLink(9000);
      expect(got?.egs_id).toBe(9000);
      expect(got?.vn_id).toBe('v123');
    });

    it('records "no VNDB counterpart" pin', () => {
      setEgsVnLink(9000, null);
      const got = getEgsVnLink(9000);
      expect(got?.vn_id).toBeNull();
    });

    it('listAllEgsVnLinks reflects every override (positive + negative)', () => {
      setEgsVnLink(9000, 'v100');
      setEgsVnLink(9001, null);
      setEgsVnLink(9002, 'v200');
      const all = listAllEgsVnLinks();
      expect(all.get(9000)).toBe('v100');
      expect(all.get(9001)).toBeNull();
      expect(all.get(9002)).toBe('v200');
    });

    it('rejects malformed egs id and vn id', () => {
      expect(() => setEgsVnLink(0, 'v1')).toThrow();
      expect(() => setEgsVnLink(-1, 'v1')).toThrow();
      expect(() => setEgsVnLink(1, 'notvn')).toThrow();
    });
  });

  describe('applyManualEgsToVndb overlay', () => {
    it('keeps native vndb_id when no override exists', () => {
      const rows = [
        { egs_id: 5000, vndb_id: 'v50' },
        { egs_id: 5001, vndb_id: null },
      ];
      const out = applyManualEgsToVndb(rows);
      expect(out[0].vndb_id).toBe('v50');
      expect(out[1].vndb_id).toBeNull();
    });

    it('replaces native vndb_id with positive override', () => {
      setEgsVnLink(9000, 'v555');
      const rows = [{ egs_id: 9000, vndb_id: 'v100' }];
      const out = applyManualEgsToVndb(rows);
      expect(out[0].vndb_id).toBe('v555');
    });

    it('replaces native vndb_id with NULL (explicit unlink)', () => {
      setEgsVnLink(9000, null);
      const rows = [{ egs_id: 9000, vndb_id: 'v100' }];
      const out = applyManualEgsToVndb(rows);
      expect(out[0].vndb_id).toBeNull();
    });

    it('returns input unchanged when no overrides at all', () => {
      // No setEgsVnLink calls in this test.
      const rows = [{ egs_id: 7777, vndb_id: 'v77' }];
      const out = applyManualEgsToVndb(rows);
      expect(out[0].vndb_id).toBe('v77');
    });
  });
});
