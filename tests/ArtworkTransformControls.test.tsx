// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtworkTransformControls } from '@/components/ArtworkTransformControls';
import { VN_BANNER_EDIT_EVENT, VN_COVER_ACTION_EVENT } from '@/lib/cover-banner-events';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const t = dictionaries.fr;

afterEach(() => vi.restoreAllMocks());

describe('ArtworkTransformControls', () => {
  it('delegates every cover transform and banner editing with the VN identity', () => {
    const coverEvents: Event[] = [];
    const bannerEvents: Event[] = [];
    const onCover = (event: Event) => coverEvents.push(event);
    const onBanner = (event: Event) => bannerEvents.push(event);
    window.addEventListener(VN_COVER_ACTION_EVENT, onCover);
    window.addEventListener(VN_BANNER_EDIT_EVENT, onBanner);
    renderWithProviders(<ArtworkTransformControls vnId="v90001" />);

    fireEvent.click(screen.getByRole('button', { name: t.coverActions.rotateLeft }));
    fireEvent.click(screen.getByRole('button', { name: t.coverActions.rotateRight }));
    fireEvent.click(screen.getByRole('button', { name: t.coverActions.resetRotation }));
    fireEvent.click(screen.getByRole('button', { name: t.banner.adjust }));

    expect(coverEvents.map((event) => (event as CustomEvent).detail)).toEqual([
      { vnId: 'v90001', action: 'rotate-left' },
      { vnId: 'v90001', action: 'rotate-right' },
      { vnId: 'v90001', action: 'reset-rotation' },
    ]);
    expect((bannerEvents[0] as CustomEvent).detail).toEqual({ vnId: 'v90001' });
    act(() => {
      window.removeEventListener(VN_COVER_ACTION_EVENT, onCover);
      window.removeEventListener(VN_BANNER_EDIT_EVENT, onBanner);
    });
  });
});
