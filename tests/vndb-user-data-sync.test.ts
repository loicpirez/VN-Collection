import { describe, expect, it } from 'vitest';
import {
  compareVndbUserData,
  decodeVndbSyncFields,
  normalizeVndbSyncText,
  statusFromVndbLabels,
  VNDB_STATUS_LABELS,
} from '@/lib/vndb-user-data-sync';

describe('VNDB user-data conflict model', () => {
  it('maps predefined labels with deterministic terminal-state precedence', () => {
    expect(statusFromVndbLabels([])).toBeNull();
    expect(statusFromVndbLabels([{ id: 99 }, VNDB_STATUS_LABELS.playing])).toBe('playing');
    expect(statusFromVndbLabels([
      VNDB_STATUS_LABELS.planning,
      VNDB_STATUS_LABELS.playing,
      VNDB_STATUS_LABELS.on_hold,
      VNDB_STATUS_LABELS.dropped,
      VNDB_STATUS_LABELS.completed,
    ])).toBe('completed');
  });

  it('validates a bounded unique field selection', () => {
    expect(decodeVndbSyncFields(['status', 'notes'])).toEqual(['status', 'notes']);
    expect(decodeVndbSyncFields([])).toBeNull();
    expect(decodeVndbSyncFields(['status', 'status'])).toBeNull();
    expect(decodeVndbSyncFields(['other'])).toBeNull();
    expect(decodeVndbSyncFields('status')).toBeNull();
    expect(decodeVndbSyncFields(['status', 'vote', 'started', 'finished', 'notes', 'status'])).toBeNull();
  });

  it('returns stable field differences and direction capabilities', () => {
    const differences = compareVndbUserData(
      {
        status: 'completed',
        vote: 90,
        started: '2025-01-01',
        finished: '2025-01-02',
        notes: 'local note',
      },
      {
        status: 'playing',
        vote: null,
        started: '2025-01-01',
        finished: null,
        notes: null,
      },
    );
    expect(differences.map((difference) => difference.field)).toEqual([
      'status',
      'vote',
      'finished',
      'notes',
    ]);
    expect(differences.every((difference) => difference.canPullRemote && difference.canPushLocal)).toBe(true);
  });

  it('prevents destructive null-status pulls and overlong-note pushes', () => {
    const differences = compareVndbUserData(
      { status: 'completed', vote: null, started: null, finished: null, notes: 'x'.repeat(10_001) },
      { status: null, vote: null, started: null, finished: null, notes: null },
    );
    expect(differences).toEqual([
      expect.objectContaining({ field: 'status', canPullRemote: false, canPushLocal: true }),
      expect.objectContaining({ field: 'notes', canPullRemote: true, canPushLocal: false }),
    ]);
  });

  it('returns no differences for aligned values and normalizes empty text', () => {
    const aligned = { status: 'planning' as const, vote: null, started: null, finished: null, notes: 'same' };
    expect(compareVndbUserData(aligned, aligned)).toEqual([]);
    expect(normalizeVndbSyncText(undefined)).toBeNull();
    expect(normalizeVndbSyncText(null)).toBeNull();
    expect(normalizeVndbSyncText('  ')).toBeNull();
    expect(normalizeVndbSyncText('  keep  ')).toBe('  keep  ');
  });
});
