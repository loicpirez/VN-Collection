// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, within, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { BrandOverlapPicker } from '@/components/BrandOverlapPicker';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const PRODUCERS = {
  producers: [
    { id: 'p90001', name: 'Studio X', original: null, vn_count: 5 },
    { id: 'p90002', name: 'Studio Y', original: null, vn_count: 3 },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('BrandOverlapPicker', () => {
  beforeEach(() => {
    push.mockClear();
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(PRODUCERS));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the loading state before the producer list resolves', () => {
    // A fetch that never settles keeps the component in its loading branch.
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    const { container } = renderWithProviders(<BrandOverlapPicker initialA={null} initialB={null} />, { locale: 'en' });
    expect(container.querySelector('svg.lucide-loader-circle')).not.toBeNull();
    expect(container.querySelector('form')).toBeNull();
  });

  it('renders two producer pickers populated from the API once loaded', async () => {
    const { container } = renderWithProviders(<BrandOverlapPicker initialA={null} initialB={null} />, { locale: 'en' });
    await waitFor(() => expect(container.querySelector('form')).not.toBeNull());
    const selectA = screen.getByLabelText('Studio A...') as HTMLSelectElement;
    const selectB = screen.getByLabelText('Studio B...') as HTMLSelectElement;
    expect(within(selectA).getByRole('option', { name: 'Studio X (5)' })).toBeTruthy();
    expect(within(selectB).getByRole('option', { name: 'Studio Y (3)' })).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledWith('/api/producers', expect.objectContaining({ cache: 'no-store' }));
  });

  it('keeps the compare button disabled until two distinct brands are chosen', async () => {
    const { user } = renderWithProviders(<BrandOverlapPicker initialA={null} initialB={null} />, { locale: 'en' });
    const compare = await screen.findByRole('button', { name: /Compare/ });
    expect(compare).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Studio A...'), 'p90001');
    expect(compare).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Studio B...'), 'p90002');
    expect(compare).not.toBeDisabled();
  });

  it('disables compare when both selects hold the same brand', async () => {
    const { user } = renderWithProviders(<BrandOverlapPicker initialA={null} initialB={null} />, { locale: 'en' });
    await screen.findByLabelText('Studio A...');
    await user.selectOptions(screen.getByLabelText('Studio A...'), 'p90001');
    await user.selectOptions(screen.getByLabelText('Studio B...'), 'p90001');
    expect(screen.getByRole('button', { name: /Compare/ })).toBeDisabled();
  });

  it('navigates to the overlap route on submit with the selected brands', async () => {
    const { user } = renderWithProviders(<BrandOverlapPicker initialA="p90001" initialB="p90002" />, { locale: 'en' });
    const compare = await screen.findByRole('button', { name: /Compare/ });
    await waitFor(() => expect(compare).not.toBeDisabled());
    await user.click(compare);
    expect(push).toHaveBeenCalledWith('/brand-overlap?a=p90001&b=p90002');
  });

  it('renders an empty list (no options beyond placeholders) when the API is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, 500));
    const { container } = renderWithProviders(<BrandOverlapPicker initialA={null} initialB={null} />, { locale: 'en' });
    await waitFor(() => expect(container.querySelector('form')).not.toBeNull());
    const selectA = screen.getByLabelText('Studio A...') as HTMLSelectElement;
    // Only the placeholder option remains.
    expect(within(selectA).getAllByRole('option')).toHaveLength(1);
  });

  it('renders an empty list when the fetch rejects', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network'));
    const { container } = renderWithProviders(<BrandOverlapPicker initialA={null} initialB={null} />, { locale: 'en' });
    await waitFor(() => expect(container.querySelector('form')).not.toBeNull());
    const selectB = screen.getByLabelText('Studio B...') as HTMLSelectElement;
    expect(within(selectB).getAllByRole('option')).toHaveLength(1);
  });

  it('re-syncs the selected values when initial props change', async () => {
    const { rerender } = renderWithProviders(<BrandOverlapPicker initialA={null} initialB={null} />, { locale: 'en' });
    const selectA = (await screen.findByLabelText('Studio A...')) as HTMLSelectElement;
    expect(selectA.value).toBe('');
    rerender(<BrandOverlapPicker initialA="p90002" initialB={null} />);
    await waitFor(() => expect((screen.getByLabelText('Studio A...') as HTMLSelectElement).value).toBe('p90002'));
  });
});
