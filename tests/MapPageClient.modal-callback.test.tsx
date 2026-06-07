// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { renderWithProviders } from './helpers/render-component';
import { dictionaries } from '@/lib/i18n/dictionaries';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: refreshMock, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/dynamic', () => ({
  default: (_loader: () => Promise<unknown>, _options?: { loading?: ComponentType }) => {
    return function MapCanvasStub() {
      return <div data-testid="map-canvas" />;
    } as ComponentType<Record<string, unknown>>;
  },
}));

vi.mock('@/components/AddEditPlaceModal', () => ({
  AddEditPlaceModal: ({ onClose, onSaved }: { onClose: () => void; onSaved: (newId?: number) => void }) => (
    <div role="dialog" aria-label="mock place modal">
      <button type="button" onClick={() => onSaved()}>
        save without id
      </button>
      <button type="button" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

const { MapPageClient } = await import('@/components/MapPageClient');
const t = dictionaries.en;

describe('MapPageClient modal callback branch', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('refreshes and closes the add-place modal even when no id is returned', async () => {
    const { user } = renderWithProviders(<MapPageClient places={[]} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: new RegExp(t.map.addPlace as string) }));
    expect(screen.getByRole('dialog', { name: 'mock place modal' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'save without id' }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'mock place modal' })).toBeNull());
  });
});
