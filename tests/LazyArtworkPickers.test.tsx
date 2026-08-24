// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LazyArtworkPickers } from '@/components/LazyArtworkPickers';
import { renderWithProviders } from './helpers/render-component';

vi.mock('@/components/CoverSourcePicker', () => ({
  CoverSourcePicker: ({ initialOpen, showTrigger, vnId }: {
    initialOpen?: boolean;
    showTrigger?: boolean;
    vnId: string;
  }) => (
    <div data-testid="lazy-cover-owner">
      {`${vnId}:${String(initialOpen)}:${String(showTrigger)}`}
    </div>
  ),
}));

vi.mock('@/components/BannerSourcePicker', () => ({
  BannerSourcePicker: ({ initialOpen, showTrigger, vnId }: {
    initialOpen?: boolean;
    showTrigger?: boolean;
    vnId: string;
  }) => (
    <div data-testid="lazy-banner-owner">
      {`${vnId}:${String(initialOpen)}:${String(showTrigger)}`}
    </div>
  ),
}));

function props(vnId: string) {
  return {
    cover: {
      vnId,
      vndbImage: null,
      egsId: null,
      egsHasImage: false,
      currentCustomCover: null,
      currentImageSource: 'auto' as const,
      currentRotation: 0 as const,
      screenshots: [],
      releaseImages: [],
    },
    banner: {
      vnId,
      currentBanner: null,
      coverRemote: null,
      coverLocal: null,
      coverSexual: null,
      screenshots: [],
      releaseImages: [],
    },
  };
}

afterEach(cleanup);

describe('LazyArtworkPickers', () => {
  it('stays empty until a scoped picker request and preserves the first request', async () => {
    renderWithProviders(<LazyArtworkPickers {...props('v90001')} />);
    expect(screen.queryByTestId('lazy-cover-owner')).toBeNull();
    expect(screen.queryByTestId('lazy-banner-owner')).toBeNull();

    fireEvent(window, new CustomEvent('vn:open-cover-picker', { detail: { vnId: 'v99999' } }));
    expect(screen.queryByTestId('lazy-cover-owner')).toBeNull();

    fireEvent(window, new CustomEvent('vn:open-cover-picker', { detail: { vnId: 'v90001' } }));
    expect(await screen.findByTestId('lazy-cover-owner')).toHaveTextContent('v90001:true:false');
  });

  it('accepts unscoped legacy events and switches to the requested owner', async () => {
    renderWithProviders(<LazyArtworkPickers {...props('v90001')} />);
    fireEvent(window, new CustomEvent('vn:open-banner-picker', { detail: { vnId: 'v99999' } }));
    expect(screen.queryByTestId('lazy-banner-owner')).toBeNull();
    fireEvent(window, new Event('vn:open-banner-picker'));
    expect(await screen.findByTestId('lazy-banner-owner')).toHaveTextContent('v90001:true:false');

    fireEvent(window, new CustomEvent('vn:open-cover-picker', { detail: { vnId: 'v90001' } }));
    expect(await screen.findByTestId('lazy-cover-owner')).toBeInTheDocument();
    expect(screen.queryByTestId('lazy-banner-owner')).toBeNull();
  });

  it('clears the active owner when the VN identity changes', async () => {
    const view = renderWithProviders(<LazyArtworkPickers {...props('v90001')} />);
    fireEvent(window, new CustomEvent('vn:open-cover-picker', { detail: { vnId: 'v90001' } }));
    expect(await screen.findByTestId('lazy-cover-owner')).toBeInTheDocument();

    view.rerender(<LazyArtworkPickers {...props('v90002')} />);
    await waitFor(() => expect(screen.queryByTestId('lazy-cover-owner')).toBeNull());
  });
});
