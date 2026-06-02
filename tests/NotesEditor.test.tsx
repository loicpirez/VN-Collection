// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { NotesEditor } from '@/components/edit-form/NotesEditor';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.fr;

describe('NotesEditor', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the personal-notes heading and a markdown editor textarea', () => {
    renderWithProviders(<NotesEditor notes="hello" onNotesChange={vi.fn()} />);
    expect(screen.getByText(t.form.personalNotes)).toBeTruthy();
    const textarea = screen.getByRole('textbox');
    expect((textarea as HTMLTextAreaElement).value).toBe('hello');
  });

  it('fires onNotesChange when typing in the textarea', () => {
    const onNotesChange = vi.fn();
    renderWithProviders(<NotesEditor notes="" onNotesChange={onNotesChange} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'updated body' } });
    expect(onNotesChange).toHaveBeenCalledWith('updated body');
  });

  it('switches to the preview tab and shows the empty hint when notes are blank', async () => {
    renderWithProviders(<NotesEditor notes="" onNotesChange={vi.fn()} />);
    const previewTab = screen.getByRole('tab', { name: new RegExp(t.markdown.preview) });
    fireEvent.click(previewTab);
    await waitFor(() => expect(screen.getByText(t.markdown.empty)).toBeTruthy());
  });

  it('renders the markdown view (dynamic import) in preview when notes have content', async () => {
    renderWithProviders(<NotesEditor notes="**bold**" onNotesChange={vi.fn()} />);
    const previewTab = screen.getByRole('tab', { name: new RegExp(t.markdown.preview) });
    fireEvent.click(previewTab);
    await waitFor(() => expect(screen.queryByText(t.markdown.empty)).toBeNull());
  });
});
