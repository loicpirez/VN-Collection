import { describe, expect, it } from 'vitest';
import {
  parseClientBooleanMap,
  parseClientPreferenceRecord,
  parseClientStringList,
  parseNamedIdRows,
  parseVndbCandidateRows,
} from '../src/lib/client-persisted-shape';

describe('client persisted JSON adapters', () => {
  it('parses preference records and normalizes malformed input', () => {
    expect(parseClientPreferenceRecord('{"view":"cards"}')).toEqual({ view: 'cards' });
    expect(parseClientPreferenceRecord('[]')).toEqual({});
    expect(parseClientPreferenceRecord('not-json')).toEqual({});
  });

  it('keeps only boolean disclosure entries', () => {
    expect(parseClientBooleanMap('{"used":true,"unused":false,"bad":"true"}')).toEqual({
      used: true,
      unused: false,
    });
  });

  it('keeps only string list members', () => {
    expect(parseClientStringList('["exact",null,4,"related"]')).toEqual(['exact', 'related']);
  });

  it('keeps only valid named identifier rows', () => {
    expect(parseNamedIdRows('[{"id":"p90001","name":"Studio X"},{"id":4,"name":"Bad"},null]')).toEqual([
      { id: 'p90001', name: 'Studio X' },
    ]);
  });

  it('keeps only valid VNDB candidates and canonicalizes ids', () => {
    expect(parseVndbCandidateRows('[{"id":"V90001","title":"Entry","alttitle":null,"released":"2026-01-01"},{"id":"egs_9000001","title":"Bad","alttitle":null,"released":null},{"id":"v90002","title":"Bad","alttitle":4,"released":null}]')).toEqual([
      { id: 'v90001', title: 'Entry', alttitle: null, released: '2026-01-01' },
    ]);
  });
});
