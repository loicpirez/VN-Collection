import { describe, expect, it } from 'vitest';
import {
  VN_BANNER_CHANGED_EVENT,
  VN_COVER_CHANGED_EVENT,
  dispatchBannerChanged,
  dispatchCoverChanged,
  type VnBannerChangedDetail,
  type VnCoverChangedDetail,
} from '@/lib/cover-banner-events';

/**
 * Pin the public contract of the cover / banner mutation event names
 * + detail shapes. Renaming the event without bumping every listener
 * silently breaks the "Set as cover" -> hero repaint loop in the
 * Media Gallery; the only safety net beyond this test would be a
 * full integration run.
 */
describe('cover-banner-events', () => {
  it('exports stable event name constants', () => {
    expect(VN_COVER_CHANGED_EVENT).toBe('vn:cover-changed');
    expect(VN_BANNER_CHANGED_EVENT).toBe('vn:banner-changed');
  });

  it('dispatch helpers no-op outside a browser', () => {
    // The vitest config uses environment: 'node', so `window` is
    // unavailable here. The dispatch helpers must NOT throw in this
    // case — they are also imported by server-rendered modules at
    // build time.
    expect(() =>
      dispatchCoverChanged({ vnId: 'v1', newSrc: null, newLocal: null }),
    ).not.toThrow();
    expect(() =>
      dispatchBannerChanged({ vnId: 'v1', newSrc: null, newLocal: null }),
    ).not.toThrow();
  });

  it('typed details accept the documented shape', () => {
    const cover: VnCoverChangedDetail = {
      vnId: 'v17',
      newSrc: 'https://example.com/a.jpg',
      newLocal: null,
      rotation: 90,
    };
    expect(cover.rotation).toBe(90);
    const banner: VnBannerChangedDetail = {
      vnId: 'v17',
      newSrc: null,
      newLocal: 'cover/x.jpg',
      position: '40% 60%',
      rotation: 0,
    };
    expect(banner.position).toBe('40% 60%');
  });
});
