// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TagPicker } from '@/components/TagPicker';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { TagPickerSummary } from '@/lib/picker-client-shape';
import { renderWithProviders } from './helpers/render-component';

const t = dictionaries.en;

function tag(overrides: Partial<TagPickerSummary> = {}): TagPickerSummary {
  return {
    id: 'g1',
    name: 'First tag',
    category: 'cont',
    vn_count: 1,
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: Error) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (reason?: Error) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function runDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(250);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TagPicker', () => {
  it('renders the empty state without optional copy', async () => {
    renderWithProviders(<TagPicker tags={[]} onChange={vi.fn()} />, { locale: 'en' });
    expect(screen.getByText(t.tagPicker.empty)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: t.tagPicker.searchPlaceholder })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.tagPicker.clearAll })).not.toBeInTheDocument();
    await runDebounce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('removes individual tags and clears the whole picked set', () => {
    const onChange = vi.fn();
    renderWithProviders(
      <TagPicker tags={[tag(), tag({ id: 'g2', name: 'Second tag' })]} onChange={onChange} label="Seeds" hint="Pick tags" />,
      { locale: 'en' },
    );
    expect(screen.getByText('Seeds')).toBeInTheDocument();
    expect(screen.getByText('Pick tags')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.tagPicker.remove.replace('{name}', 'First tag') }));
    expect(onChange).toHaveBeenLastCalledWith([tag({ id: 'g2', name: 'Second tag' })]);
    fireEvent.click(screen.getByRole('button', { name: t.tagPicker.clearAll }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('searches with a trimmed category query, disables picked hits, and adds a new result', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    const onChange = vi.fn();
    renderWithProviders(<TagPicker tags={[tag()]} onChange={onChange} category="ero" />, { locale: 'en' });
    fireEvent.change(screen.getByRole('textbox', { name: t.tagPicker.searchPlaceholder }), { target: { value: '  alpha  ' } });
    await runDebounce();
    expect(fetch).toHaveBeenCalledWith('/api/tags?q=alpha&results=20&category=ero', expect.objectContaining({ cache: 'no-store' }));
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();

    await act(async () => pending.resolve(jsonResponse({
      tags: [
        { id: 'G1', name: 'First tag', category: 'cont', vn_count: 1 },
        { id: 'G2', name: 'Second tag', category: 'tech', vn_count: 1234 },
      ],
    })));
    const existing = screen.getByTitle('g1');
    expect(existing).toBeDisabled();
    expect(existing).toHaveClass('opacity-50');
    const second = screen.getByTitle('g2');
    expect(second).not.toBeDisabled();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    fireEvent.click(second);
    expect(onChange).toHaveBeenCalledWith([tag(), tag({ id: 'g2', name: 'Second tag', category: 'tech', vn_count: 1234 })]);
    expect(screen.getByRole('textbox', { name: t.tagPicker.searchPlaceholder })).toHaveValue('');
    expect(screen.queryByRole('button', { name: /Second tag/ })).not.toBeInTheDocument();
  });

  it('keeps results empty for HTTP failures and malformed payloads', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'failed' }, 500))
      .mockResolvedValueOnce(jsonResponse({ tags: [{ id: 'bad' }] }));
    renderWithProviders(<TagPicker tags={[]} onChange={vi.fn()} />, { locale: 'en' });
    const input = screen.getByRole('textbox', { name: t.tagPicker.searchPlaceholder });
    fireEvent.change(input, { target: { value: 'first' } });
    await runDebounce();
    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'second' } });
    await runDebounce();
    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith('/api/tags?q=second&results=20', expect.any(Object));
  });

  it('clears results for network errors but leaves them intact for AbortError', async () => {
    const aborted = new Error('aborted');
    aborted.name = 'AbortError';
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ tags: [{ id: 'g2', name: 'Second tag', category: 'cont', vn_count: 2 }] }))
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce(jsonResponse({ tags: [{ id: 'g3', name: 'Third tag', category: 'cont', vn_count: 3 }] }))
      .mockRejectedValueOnce(aborted);
    renderWithProviders(<TagPicker tags={[]} onChange={vi.fn()} />, { locale: 'en' });
    const input = screen.getByRole('textbox', { name: t.tagPicker.searchPlaceholder });

    fireEvent.change(input, { target: { value: 'second' } });
    await runDebounce();
    expect(screen.getByTitle('g2')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'network' } });
    await runDebounce();
    expect(screen.queryByTitle('g2')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'third' } });
    await runDebounce();
    expect(screen.getByTitle('g3')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'abort' } });
    await runDebounce();
    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
    expect(screen.getByTitle('g3')).toBeInTheDocument();
  });

  it('aborts an obsolete search and ignores its late response', async () => {
    const first = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(jsonResponse({ tags: [{ id: 'g3', name: 'Third tag', category: 'cont', vn_count: 3 }] }));
    renderWithProviders(<TagPicker tags={[]} onChange={vi.fn()} />, { locale: 'en' });
    const input = screen.getByRole('textbox', { name: t.tagPicker.searchPlaceholder });
    fireEvent.change(input, { target: { value: 'first' } });
    await runDebounce();
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    fireEvent.change(input, { target: { value: 'third' } });
    expect(request?.signal?.aborted).toBe(true);
    await runDebounce();
    expect(screen.getByTitle('g3')).toBeInTheDocument();

    await act(async () => first.resolve(jsonResponse({ tags: [{ id: 'g2', name: 'Second tag', category: 'cont', vn_count: 2 }] })));
    expect(screen.queryByTitle('g2')).not.toBeInTheDocument();
  });

  it('aborts an active search during teardown', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    const mounted = renderWithProviders(<TagPicker tags={[]} onChange={vi.fn()} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('textbox', { name: t.tagPicker.searchPlaceholder }), { target: { value: 'first' } });
    await runDebounce();
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    mounted.unmount();
    expect(request?.signal?.aborted).toBe(true);
    await act(async () => pending.reject(new Error('late failure')));
  });
});
