// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { ClearCacheModal } from '@/components/stock/ClearCacheModal';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries[DEFAULT_LOCALE];

describe('ClearCacheModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders the dialog with the localized title and confirm copy', () => {
    renderWithProviders(<ClearCacheModal t={t} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText(t.stock.clearCacheConfirm as string)).toBeTruthy();
  });

  it('fires onConfirm when the destructive confirm button is clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(<ClearCacheModal t={t} onCancel={onCancel} onConfirm={onConfirm} />);
    // Two buttons carry the "clear cache" label (heading-adjacent + confirm).
    const clearButtons = screen.getAllByRole('button', { name: t.stock.clearCache as string });
    fireEvent.click(clearButtons[clearButtons.length - 1]);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('fires onCancel when the cancel button is clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(<ClearCacheModal t={t} onCancel={onCancel} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: t.common.cancel as string }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('fires onCancel when the backdrop scrim is clicked', () => {
    const onCancel = vi.fn();
    renderWithProviders(<ClearCacheModal t={t} onCancel={onCancel} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: t.common.close as string }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel when Escape is pressed (dialog a11y hook)', () => {
    const onCancel = vi.fn();
    renderWithProviders(<ClearCacheModal t={t} onCancel={onCancel} onConfirm={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});
