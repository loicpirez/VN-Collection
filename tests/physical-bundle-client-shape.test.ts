import { describe, expect, it } from 'vitest';
import {
  decodePhysicalBundleResponse,
  decodePhysicalBundlesResponse,
} from '@/lib/physical-bundle-client-shape';

const member = {
  vn_id: 'V990401',
  release_id: 'r990401',
  vn_title: 'Synthetic member',
  edition_label: null,
  position: 0,
};

const bundle = {
  id: 1,
  name: 'Synthetic bundle',
  anchor_vn_id: 'V990401',
  anchor_release_id: 'r990401',
  created_at: 1,
  updated_at: 2,
  members: [member, { ...member, vn_id: 'v990402', release_id: 'r990402', position: 1 }],
};

describe('physical bundle response adapters', () => {
  it('normalizes a valid list and mutation response', () => {
    expect(decodePhysicalBundlesResponse({ bundles: [bundle] })?.bundles[0]).toMatchObject({
      anchor_vn_id: 'v990401',
      members: [{ vn_id: 'v990401' }, { vn_id: 'v990402' }],
    });
    expect(decodePhysicalBundleResponse({ bundle })?.bundle.id).toBe(1);
    expect(decodePhysicalBundlesResponse({ bundles: [] })).toEqual({ bundles: [] });
  });

  it('rejects malformed containers, bundles, members, and anchors', () => {
    expect(decodePhysicalBundlesResponse(null)).toBeNull();
    expect(decodePhysicalBundlesResponse({ bundles: 'bad' })).toBeNull();
    expect(decodePhysicalBundleResponse({ bundle: null })).toBeNull();
    for (const invalid of [
      { ...bundle, id: 0 },
      { ...bundle, name: 2 },
      { ...bundle, anchor_vn_id: 'bad' },
      { ...bundle, anchor_release_id: 2 },
      { ...bundle, created_at: Number.NaN },
      { ...bundle, updated_at: 'bad' },
      { ...bundle, members: 'bad' },
      { ...bundle, members: [member] },
      { ...bundle, anchor_release_id: 'missing' },
      { ...bundle, members: [{ ...member, vn_id: 'bad' }, bundle.members[1]] },
      { ...bundle, members: [{ ...member, release_id: 2 }, bundle.members[1]] },
      { ...bundle, members: [{ ...member, vn_title: 2 }, bundle.members[1]] },
      { ...bundle, members: [{ ...member, edition_label: 2 }, bundle.members[1]] },
      { ...bundle, members: [{ ...member, position: -1 }, bundle.members[1]] },
      { ...bundle, members: [{ ...member, position: 0.5 }, bundle.members[1]] },
    ]) expect(decodePhysicalBundlesResponse({ bundles: [invalid] })).toBeNull();
  });
});
