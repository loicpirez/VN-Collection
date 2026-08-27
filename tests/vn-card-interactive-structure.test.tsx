// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VnCard } from '@/components/VnCard';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { renderWithProviders } from './helpers/render-component';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('VN card interactive structure', () => {
  it('keeps cover controls outside navigation links, including the R18 reveal action', () => {
    const view = renderWithProviders(
      <DisplaySettingsProvider initial={{ blurR18: true, nsfwThreshold: 1.5 }}>
        <VnCard
          data={{
            id: 'v90001',
            title: 'Card title',
            poster: 'https://images.example.test/cover.jpg',
            released: null,
            rating: null,
            sexual: 2,
            status: 'planning',
          }}
          onRemoveFromWishlist={vi.fn()}
        />
      </DisplaySettingsProvider>,
      { locale: 'en' },
    );

    const card = view.container.querySelector('.group.relative.flex.flex-col');
    expect(card).toBeInstanceOf(HTMLElement);
    const buttons = [...card!.querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThanOrEqual(5);
    for (const button of buttons) expect(button.closest('a')).toBeNull();
    expect(card!.querySelector('a[aria-hidden="true"][tabindex="-1"]')).toBeInTheDocument();
    expect(within(card as HTMLElement).getAllByRole('link')).toHaveLength(1);
  });
});
