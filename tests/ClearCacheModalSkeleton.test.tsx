// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { ClearCacheModalSkeleton } from '@/components/stock/ClearCacheModalSkeleton';
import { renderWithProviders } from './helpers/render-component';

describe('ClearCacheModalSkeleton', () => {
  it('reserves the modal panel and two actions in the modal layer', () => {
    renderWithProviders(<ClearCacheModalSkeleton />, { locale: 'en' });

    const status = screen.getByRole('status');
    expect(status.hasAttribute('data-clear-cache-modal-skeleton')).toBe(true);
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(status.querySelector('.max-w-sm')).not.toBeNull();
    expect(status.querySelectorAll('.h-11')).toHaveLength(2);
  });
});
