// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { VndbMarkup } from '@/components/VndbMarkup';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function renderMarkup(text: string | null | undefined, spoilerLabel = 'Spoiler') {
  return renderWithProviders(
    <DisplaySettingsProvider>
      <VndbMarkup text={text} spoilerLabel={spoilerLabel} className="markup-root" />
    </DisplaySettingsProvider>,
    { locale: 'en' },
  );
}

describe('VndbMarkup renderer branches', () => {
  it('returns null for empty text (no span emitted)', () => {
    const { container } = renderMarkup('');
    expect(container.querySelector('.markup-root')).toBeNull();
  });

  it('returns null for null text', () => {
    const { container } = renderMarkup(null);
    expect(container.querySelector('.markup-root')).toBeNull();
  });

  it('renders plain text inside the className span and converts newlines to <br>', () => {
    const { container } = renderMarkup('line one\nline two');
    const root = container.querySelector('.markup-root') as HTMLElement;
    expect(root).toBeInTheDocument();
    expect(root.textContent).toBe('line oneline two');
    expect(root.querySelector('br')).not.toBeNull();
  });

  it('renders [b] [i] [u] [s] as strong/em/underline/strike', () => {
    const { container } = renderMarkup('[b]B[/b][i]I[/i][u]U[/u][s]S[/s]');
    const root = container.querySelector('.markup-root') as HTMLElement;
    expect(root.querySelector('strong')!.textContent).toBe('B');
    expect(root.querySelector('em')!.textContent).toBe('I');
    expect(root.querySelector('span.underline')!.textContent).toBe('U');
    expect(root.querySelector('span.line-through')!.textContent).toBe('S');
  });

  it('renders an external [url=https] as a target=_blank anchor with the label', () => {
    renderMarkup('[url=https://example.com/page]External Y[/url]');
    const link = screen.getByRole('link', { name: 'External Y' });
    expect(link.getAttribute('href')).toBe('https://example.com/page');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders an internal VNDB ref (v90001) as a Next Link with a relative href (no target=_blank)', () => {
    renderMarkup('[url=v90001]Title Y[/url]');
    const link = screen.getByRole('link', { name: 'Title Y' });
    expect(link.getAttribute('href')!.startsWith('/')).toBe(true);
    expect(link.getAttribute('target')).toBeNull();
  });

  it('falls back to the url text when the external [url] label is empty', () => {
    renderMarkup('[url=https://example.com/empty][/url]');
    const link = screen.getByRole('link', { name: 'https://example.com/empty' });
    expect(link.getAttribute('href')).toBe('https://example.com/empty');
  });

  it('falls back to the url text when an internal [url] label is empty', () => {
    renderMarkup('[url=/c90001][/url]');
    // The visible label is the raw fallback; the href is normalized to the
    // internal character route and rendered as a Next Link (no target).
    const link = screen.getByRole('link', { name: '/c90001' });
    expect(link.getAttribute('href')!.startsWith('/')).toBe(true);
    expect(link.getAttribute('target')).toBeNull();
  });

  it('autolinks a bare http URL inside plain text and strips trailing punctuation', () => {
    renderMarkup('visit https://example.com/path. now');
    const link = screen.getByRole('link', { name: 'https://example.com/path' });
    expect(link.getAttribute('href')).toBe('https://example.com/path');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('rewrites a javascript: scheme url to # (sanitized as external anchor)', () => {
    renderMarkup('[url=javascript:alert(1)]bad[/url]');
    const link = screen.getByRole('link', { name: 'bad' });
    expect(link.getAttribute('href')).toBe('#');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('renders [spoiler] through the SpoilerReveal gate using the supplied label', () => {
    renderMarkup('[spoiler]Heroine A leaves[/spoiler]', 'Reveal spoiler');
    // Hidden by default → exposed as a button with the spoiler label.
    const gate = screen.getByRole('button', { name: 'Reveal spoiler' });
    expect(within(gate).getByText('Heroine A leaves')).toBeInTheDocument();
  });

  it('renders an external [url] whose label itself contains BBCode (recursive children)', () => {
    renderMarkup('[url=https://example.com/x][b]bold link[/b][/url]');
    const link = screen.getByRole('link', { name: 'bold link' });
    expect(link.querySelector('strong')!.textContent).toBe('bold link');
  });
});
