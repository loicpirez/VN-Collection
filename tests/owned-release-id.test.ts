import { describe, expect, it } from 'vitest';
import { parseOwnedReleaseIdentity } from '@/lib/owned-release-id';

describe('owned-release shelf identity parsing', () => {
  it('normalizes VNDB and synthetic identities', () => {
    expect(parseOwnedReleaseIdentity('V123', 'SYNTHETIC:V123')).toEqual({
      ok: true,
      value: { vnId: 'v123', releaseId: 'synthetic:v123' },
    });
    expect(parseOwnedReleaseIdentity('V123', 'R456')).toEqual({
      ok: true,
      value: { vnId: 'v123', releaseId: 'r456' },
    });
  });

  it('rejects malformed VN ids and mismatched synthetic releases', () => {
    expect(parseOwnedReleaseIdentity('../etc/passwd', 'r1').ok).toBe(false);
    expect(parseOwnedReleaseIdentity('v123', 'synthetic:v456').ok).toBe(false);
  });
});
