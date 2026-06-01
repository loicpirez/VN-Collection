import { describe, expect, it } from 'vitest';
import {
  decodeActivityEntryResponse,
  decodeGameLogEntryResponse,
  decodeReadingGoalMutationResponse,
  decodeReadingGoalResponse,
  decodeReadingQueueResponse,
  decodeRoutesResponse,
} from '@/lib/tracking-client-shape';

describe('tracking client response decoders', () => {
  it('normalizes reading queue identifiers and rejects malformed rows', () => {
    expect(decodeReadingQueueResponse({
      entries: [{ vn_id: 'V90017', position: 1, added_at: 10 }],
    })).toEqual({
      entries: [{ vn_id: 'v90017', position: 1, added_at: 10 }],
    });
    expect(decodeReadingQueueResponse({ entries: [{ vn_id: 'bad', position: 1, added_at: 10 }] })).toBeNull();
  });

  it('decodes reading goals and rejects targets outside the persisted contract', () => {
    const goal = { year: 2026, target: 24, updated_at: 10 };
    expect(decodeReadingGoalResponse({ year: 2026, goal, finished: 3 })).toEqual({
      year: 2026,
      goal,
      finished: 3,
    });
    expect(decodeReadingGoalResponse({ year: 2026, goal: null, finished: 0 })).toEqual({
      year: 2026,
      goal: null,
      finished: 0,
    });
    expect(decodeReadingGoalMutationResponse({ goal })).toEqual(goal);
    expect(decodeReadingGoalMutationResponse({ goal: { ...goal, target: 1_001 } })).toBeNull();
  });

  it('decodes game-log and activity mutation rows', () => {
    expect(decodeGameLogEntryResponse({
      entry: {
        id: 1,
        vn_id: 'V90017',
        note: 'note',
        logged_at: 10,
        session_minutes: 25,
        created_at: 10,
        updated_at: 10,
      },
    })?.vn_id).toBe('v90017');
    expect(decodeGameLogEntryResponse({ entry: { id: 1 } })).toBeNull();
    expect(decodeActivityEntryResponse({
      entry: {
        id: 2,
        vn_id: 'v90017',
        kind: 'manual',
        payload: { text: 'note' },
        occurred_at: 10,
      },
    })?.kind).toBe('manual');
    expect(decodeActivityEntryResponse({
      entry: {
        id: 2,
        vn_id: 'v90017',
        kind: 'unexpected',
        payload: null,
        occurred_at: 10,
      },
    })).toBeNull();
  });

  it('decodes route rows and rejects malformed dates', () => {
    const route = {
      id: 1,
      vn_id: 'V90017',
      name: 'Route A',
      completed: true,
      completed_date: '2026-06-01',
      order_index: 0,
      notes: null,
      created_at: 10,
      updated_at: 10,
    };
    expect(decodeRoutesResponse({ routes: [route] })?.[0]?.vn_id).toBe('v90017');
    expect(decodeRoutesResponse({ routes: [{ ...route, completed_date: '01/06/2026' }] })).toBeNull();
  });
});
