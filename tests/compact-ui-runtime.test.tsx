// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { NotesSectionToggle } from '@/components/NotesSectionToggle';
import { LangFlag, LangList } from '@/components/LangFlag';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { NavTabStrip } from '@/components/NavTabStrip';
import { QuoteAvatar } from '@/components/QuoteAvatar';
import { setLocale } from '@/lib/i18n/actions';
import { DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigationMocks.push }),
}));

vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<ComponentType<{ source: string }>>) => {
    void loader();
    return ({ source }: { source: string }) => <div data-testid="markdown">{source}</div>;
  },
}));

vi.mock('@/lib/i18n/actions', () => ({
  setLocale: vi.fn(),
}));

vi.mock('@/components/LoadingImage', () => ({
  LoadingImage: ({ alt, height, src, width }: { alt: string; height?: number; src: string; width?: number }) => (
    <img alt={alt} data-height={height} data-width={width} src={src} />
  ),
}));

afterEach(() => {
  cleanup();
  navigationMocks.push.mockReset();
  vi.mocked(setLocale).mockReset();
});

describe('compact UI primitives', () => {
  it('renders notes markdown or the explicit empty label', () => {
    const { rerender } = render(<NotesSectionToggle notes="body" emptyLabel="No notes" />);
    expect(screen.getByTestId('markdown')).toHaveTextContent('body');
    rerender(<NotesSectionToggle notes={null} emptyLabel="No notes" />);
    expect(screen.getByText('No notes')).toBeInTheDocument();
  });

  it('renders localized language flags and clickable or static lists', () => {
    const { rerender } = render(<LangFlag lang="ja" withCode className="extra" locale="en" />);
    expect(screen.getByLabelText(/Japanese/i)).toHaveClass('extra');
    expect(screen.getByText('JA')).toBeInTheDocument();

    rerender(<LangList langs={[]} />);
    expect(document.body.textContent).toBe('');
    rerender(<LangList langs={['ja']} locale="en" />);
    expect(screen.getByRole('link', { name: /Japanese/i })).toHaveAttribute('href', '/search?langs=ja');
    rerender(<LangList langs={['xx']} clickable={false} locale="en" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('XX')).toBeInTheDocument();
  });

  it('shows autonyms and an optimistic busy state while the locale action runs', async () => {
    let resolveLocale!: () => void;
    vi.mocked(setLocale).mockReturnValue(new Promise<void>((resolve) => {
      resolveLocale = resolve;
    }));
    renderWithProviders(<LanguageSwitcher />);
    const select = screen.getByRole('combobox');
    expect(screen.getByRole('option', { name: 'Français' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '日本語' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'ja' } });
    expect(setLocale).toHaveBeenCalledWith('ja');
    expect(select).toHaveValue('ja');
    expect(select.parentElement).toHaveAttribute('aria-busy', 'true');
    await act(async () => {
      resolveLocale();
    });
    await waitFor(() => expect(select.parentElement).not.toHaveAttribute('aria-busy'));
  });

  it('rolls the optimistic locale back when the server action fails', async () => {
    vi.mocked(setLocale).mockRejectedValueOnce(new Error('locale unavailable'));
    renderWithProviders(<LanguageSwitcher />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'ja' } });
    expect(select).toHaveValue('ja');
    await waitFor(() => expect(select).toHaveValue(DEFAULT_LOCALE));
  });

  it('pushes navigation tab hrefs and marks the active page', () => {
    render(
      <NavTabStrip
        ariaLabel="Scope"
        tabs={[
          { href: '/staff', label: 'All', isActive: true },
          { href: '/staff?scope=collection', label: 'Collection', isActive: false },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Collection' }));
    expect(navigationMocks.push).toHaveBeenCalledWith('/staff?scope=collection');
  });

  it('uses character, cover, and icon quote-avatar presentation modes', () => {
    const { rerender } = render(<QuoteAvatar quote={null} />);
    expect(document.querySelector('svg')).toBeInTheDocument();

    rerender(<QuoteAvatar quote={{ character_id: 'c1', character_local_image: 'portrait.jpg' }} alt="Portrait" size={20} />);
    expect(screen.getByRole('img', { name: 'Portrait' })).toHaveAttribute('src', '/api/files/portrait.jpg');
    expect(screen.getByRole('img', { name: 'Portrait' })).toHaveAttribute('data-height', '20');

    rerender(<QuoteAvatar quote={{ vn_local_image_thumb: 'cover.jpg' }} alt="Cover" size={20} />);
    expect(screen.getByRole('img', { name: 'Cover' })).toHaveAttribute('src', '/api/files/cover.jpg');
    expect(screen.getByRole('img', { name: 'Cover' })).toHaveAttribute('data-height', '30');

    rerender(<QuoteAvatar quote={{ character_id: 'c2', character_local_image: 'nested.jpg', character: { id: 'c2', name: 'Nested name' } }} />);
    expect(screen.getByRole('img', { name: 'Nested name' })).toHaveAttribute('src', '/api/files/nested.jpg');

    rerender(<QuoteAvatar quote={{ character_id: 'c3', character_local_image: 'flat.jpg', character_name: 'Flat name' }} />);
    expect(screen.getByRole('img', { name: 'Flat name' })).toHaveAttribute('src', '/api/files/flat.jpg');
  });
});
