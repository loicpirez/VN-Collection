import { describe, expect, it } from 'vitest';
import { resolveField } from '@/lib/source-resolve';

describe('resolveField', () => {
  describe('auto / vndb-first preference', () => {
    it('returns vndb value when both are present', () => {
      expect(resolveField('vndb-val', 'egs-val', 'auto')).toEqual({
        value: 'vndb-val',
        used: 'vndb',
        fellBack: false,
      });
    });

    it('falls back to egs when vndb is null', () => {
      expect(resolveField(null, 'egs-val', 'auto')).toEqual({
        value: 'egs-val',
        used: 'egs',
        fellBack: true,
      });
    });

    it('falls back to egs when vndb is empty string', () => {
      expect(resolveField('', 'egs-val', 'auto')).toEqual({
        value: 'egs-val',
        used: 'egs',
        fellBack: true,
      });
    });

    it('falls back to egs when vndb is whitespace-only string', () => {
      expect(resolveField('   ', 'egs-val', 'auto')).toEqual({
        value: 'egs-val',
        used: 'egs',
        fellBack: true,
      });
    });

    it('falls back to egs when vndb is empty array', () => {
      expect(resolveField([], ['a'], 'auto')).toEqual({
        value: ['a'],
        used: 'egs',
        fellBack: true,
      });
    });

    it('returns null when both sides are null', () => {
      expect(resolveField(null, null, 'auto')).toEqual({
        value: null,
        used: null,
        fellBack: false,
      });
    });

    it('defaults to auto when pref is omitted', () => {
      expect(resolveField('vndb-val', 'egs-val')).toEqual({
        value: 'vndb-val',
        used: 'vndb',
        fellBack: false,
      });
    });
  });

  describe('explicit vndb preference', () => {
    it('uses vndb when present', () => {
      expect(resolveField('vndb-val', 'egs-val', 'vndb')).toEqual({
        value: 'vndb-val',
        used: 'vndb',
        fellBack: false,
      });
    });

    it('falls back to egs when vndb is null', () => {
      expect(resolveField(null, 'egs-val', 'vndb')).toEqual({
        value: 'egs-val',
        used: 'egs',
        fellBack: true,
      });
    });
  });

  describe('explicit egs preference', () => {
    it('uses egs when present', () => {
      expect(resolveField('vndb-val', 'egs-val', 'egs')).toEqual({
        value: 'egs-val',
        used: 'egs',
        fellBack: false,
      });
    });

    it('falls back to vndb when egs is null', () => {
      expect(resolveField('vndb-val', null, 'egs')).toEqual({
        value: 'vndb-val',
        used: 'vndb',
        fellBack: true,
      });
    });

    it('falls back to vndb when egs is empty array', () => {
      expect(resolveField(['x'], [], 'egs')).toEqual({
        value: ['x'],
        used: 'vndb',
        fellBack: true,
      });
    });

    it('returns null when both sides are null', () => {
      expect(resolveField(null, null, 'egs')).toEqual({
        value: null,
        used: null,
        fellBack: false,
      });
    });
  });

  describe('custom preference', () => {
    it('treats custom the same as vndb-first (no custom source in resolveField)', () => {
      expect(resolveField('vndb-val', 'egs-val', 'custom')).toEqual({
        value: 'vndb-val',
        used: 'vndb',
        fellBack: false,
      });
    });
  });

  describe('numeric values', () => {
    it('handles number 0 as present (not empty)', () => {
      expect(resolveField(0, 100, 'vndb')).toEqual({
        value: 0,
        used: 'vndb',
        fellBack: false,
      });
    });
  });
});
