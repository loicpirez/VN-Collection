// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownView } from '@/components/MarkdownView';
import { I18nProvider } from '@/lib/i18n/client';
import { dictionaries } from '@/lib/i18n/dictionaries';

const t = dictionaries.en;

function renderMarkdown(source: string) {
  render(
    <I18nProvider locale="en" dict={t}>
      <MarkdownView source={source} />
    </I18nProvider>,
  );
}

describe('MarkdownView', () => {
  it('wraps markdown tables in a named scroll region', () => {
    renderMarkdown('| Title | Value |\n| --- | --- |\n| Row | Cell |');

    const region = screen.getByRole('region', { name: t.markdown.tableRegion });
    expect(region).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Cell' })).toBeInTheDocument();
  });

  it('keeps wide code blocks scrollable through the markdown prose styles', () => {
    renderMarkdown('```ts\nconst title = "wide block";\n```');

    const codeBlock = screen.getByText('const title = "wide block";').closest('pre');
    expect(codeBlock).not.toBeNull();
    expect(codeBlock?.textContent).toContain('const title = "wide block";');
  });

  it('renders links and nested lists as accessible markdown content', () => {
    renderMarkdown('- Parent\n  - [Child](https://example.test)');

    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Child' })).toHaveAttribute('href', 'https://example.test');
  });
});
