// @vitest-environment jsdom
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { VnCollectionVisibility } from '@/components/VnCollectionVisibility';
import { dispatchVnCollectionChanged, VN_COLLECTION_CHANGED_EVENT } from '@/lib/vn-collection-events';
import { renderWithProviders } from './helpers/render-component';

afterEach(cleanup);

describe('VnCollectionVisibility', () => {
  it('tracks scoped add and remove events for positive and inverse surfaces', () => {
    renderWithProviders(
      <>
        <VnCollectionVisibility vnId="v90001" initialInCollection={false} when>
          <span>Owned actions</span>
        </VnCollectionVisibility>
        <VnCollectionVisibility vnId="v90001" initialInCollection={false} when={false}>
          <span>Public actions</span>
        </VnCollectionVisibility>
      </>,
    );
    expect(screen.queryByText('Owned actions')).toBeNull();
    expect(screen.getByText('Public actions')).toBeTruthy();
    act(() => dispatchVnCollectionChanged({ vnId: 'v99999', inCollection: true }));
    expect(screen.queryByText('Owned actions')).toBeNull();
    act(() => dispatchVnCollectionChanged({ vnId: 'v90001', inCollection: true }));
    expect(screen.getByText('Owned actions')).toBeTruthy();
    expect(screen.queryByText('Public actions')).toBeNull();
    act(() => dispatchVnCollectionChanged({ vnId: 'v90001', inCollection: false }));
    expect(screen.queryByText('Owned actions')).toBeNull();
    expect(screen.getByText('Public actions')).toBeTruthy();
  });

  it('ignores malformed events and resets from changed server identity and state', () => {
    const view = renderWithProviders(
      <VnCollectionVisibility vnId="v90001" initialInCollection when>
        <span>Owned actions</span>
      </VnCollectionVisibility>,
    );
    act(() => window.dispatchEvent(new Event(VN_COLLECTION_CHANGED_EVENT)));
    expect(screen.getByText('Owned actions')).toBeTruthy();
    view.rerender(
      <VnCollectionVisibility vnId="v90002" initialInCollection={false} when>
        <span>Owned actions</span>
      </VnCollectionVisibility>,
    );
    expect(screen.queryByText('Owned actions')).toBeNull();
    view.rerender(
      <VnCollectionVisibility vnId="v90002" initialInCollection when>
        <span>Owned actions</span>
      </VnCollectionVisibility>,
    );
    expect(screen.getByText('Owned actions')).toBeTruthy();
  });
});
