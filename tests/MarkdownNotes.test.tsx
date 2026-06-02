// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { ComponentType, ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarkdownNotes } from '@/components/MarkdownNotes';
import { I18nProvider } from '@/lib/i18n/client';
import { dictionaries } from '@/lib/i18n/dictionaries';

const dynamicState = vi.hoisted<{
  loader: (() => Promise<ComponentType<{ source: string }>>) | null;
  loading: (() => ReactNode) | null;
}>(() => ({ loader: null, loading: null }));

vi.mock('next/dynamic', () => ({
  default: (
    loader: () => Promise<ComponentType<{ source: string }>>,
    options: { loading?: () => ReactNode },
  ) => {
    dynamicState.loader = loader;
    dynamicState.loading = options.loading ?? null;
    return ({ source }: { source: string }) => <div data-testid="markdown-view">{source}</div>;
  },
}));

const t = dictionaries.en;

function withLocale(ui: ReactNode) {
  return (
    <I18nProvider locale="en" dict={t}>
      {ui}
    </I18nProvider>
  );
}

afterEach(cleanup);

describe('MarkdownNotes runtime', () => {
  it('edits text through the localized default placeholder', () => {
    const onChange = vi.fn<(value: string) => void>();
    render(withLocale(<MarkdownNotes value="" onChange={onChange} />));
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'updated' } });
    expect(onChange).toHaveBeenCalledWith('updated');
  });

  it('supports a custom placeholder and renders non-empty preview content', () => {
    const onChange = vi.fn<(value: string) => void>();
    render(withLocale(<MarkdownNotes value="# Heading" onChange={onChange} placeholder="Personal notes" />));
    expect(screen.getByRole('textbox', { name: 'Personal notes' })).toHaveAttribute('placeholder', 'Personal notes');
    fireEvent.click(screen.getByRole('tab', { name: t.markdown.preview }));
    expect(screen.getByTestId('markdown-view')).toHaveTextContent('# Heading');
    fireEvent.click(screen.getByRole('tab', { name: t.markdown.edit }));
    expect(screen.getByRole('textbox', { name: 'Personal notes' })).toBeInTheDocument();
  });

  it('renders the empty-state preview for whitespace-only notes', () => {
    render(withLocale(<MarkdownNotes value="   " onChange={vi.fn<(value: string) => void>()} />));
    fireEvent.click(screen.getByRole('tab', { name: t.markdown.preview }));
    expect(screen.getByText(t.markdown.empty)).toBeInTheDocument();
  });

  it('moves tab focus with arrow keys and ignores unrelated keys', () => {
    render(withLocale(<MarkdownNotes value="body" onChange={vi.fn<(value: string) => void>()} />));
    const tablist = screen.getByRole('tablist', { name: t.markdown.viewLabel });
    const edit = screen.getByRole('tab', { name: t.markdown.edit });
    const preview = screen.getByRole('tab', { name: t.markdown.preview });
    edit.focus();

    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(edit).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(preview).toHaveAttribute('aria-selected', 'true');
    expect(preview).toHaveFocus();
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(edit).toHaveAttribute('aria-selected', 'true');
    expect(edit).toHaveFocus();
  });

  it('exposes a deferred renderer loader and loading placeholder', async () => {
    expect(await dynamicState.loader!()).toBeTypeOf('function');
    render(<>{dynamicState.loading!()}</>);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });
});
