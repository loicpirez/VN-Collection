// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { CustomSynopsis } from '@/components/CustomSynopsis';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;

function okResponse() {
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
}

function errorResponse(msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'content-type': 'application/json' } });
}

function renderSynopsis(props: Partial<React.ComponentProps<typeof CustomSynopsis>> = {}) {
  return renderWithProviders(
    <DisplaySettingsProvider>
      <CustomSynopsis
        vnId="v90001"
        label="Synopsis"
        initial={null}
        fallback={<div data-testid="fallback">VNDB / EGS fallback</div>}
        {...props}
      />
    </DisplaySettingsProvider>,
    { locale: 'en' },
  );
}

describe('CustomSynopsis branches', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(okResponse());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the fallback plus an add button when no custom synopsis exists', () => {
    renderSynopsis({ initial: null });
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(t.customSynopsis.add) })).toBeInTheDocument();
    // No badge / delete in the empty state.
    expect(screen.queryByText(t.customSynopsis.badge)).toBeNull();
  });

  it('renders the custom synopsis through the markup body with a badge when set', () => {
    renderSynopsis({ initial: 'My personal take' });
    expect(screen.getByText(t.customSynopsis.badge)).toBeInTheDocument();
    expect(screen.getByText('My personal take')).toBeInTheDocument();
    expect(screen.queryByTestId('fallback')).toBeNull();
  });

  it('toggles the sources panel open and closed when a custom synopsis is set', () => {
    renderSynopsis({ initial: 'Take' });
    expect(screen.queryByTestId('fallback')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t.customSynopsis.showSources }));
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.customSynopsis.hideSources }));
    expect(screen.queryByTestId('fallback')).toBeNull();
  });

  it('enters edit mode from the empty state and PATCHes the typed text on save', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderSynopsis({ initial: null });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.customSynopsis.add) }));
    const editor = screen.getByLabelText('Synopsis') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'Brand new synopsis' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.common.save) }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/collection/v90001/custom-description');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ text: 'Brand new synopsis' });
  });

  it('PATCHes null when the saved text is emptied', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderSynopsis({ initial: 'Existing' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.common.edit) }));
    const editor = screen.getByLabelText('Synopsis');
    fireEvent.change(editor, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.common.save) }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ text: null });
  });

  it('cancels edit mode and restores the original text', () => {
    renderSynopsis({ initial: 'Original copy' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.common.edit) }));
    const editor = screen.getByLabelText('Synopsis') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'Discarded edit' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.common.cancel) }));
    // Back in read mode showing the original markup body.
    expect(screen.getByText('Original copy')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Discarded edit')).toBeNull();
  });

  it('surfaces an error toast when the save PATCH fails', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(errorResponse('save boom'));
    renderSynopsis({ initial: null });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.customSynopsis.add) }));
    fireEvent.change(screen.getByLabelText('Synopsis'), { target: { value: 'Will fail' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.common.save) }));
    await waitFor(() => expect(screen.getByText('save boom')).toBeInTheDocument());
  });

  it('clears the custom synopsis after confirming and reverts to the fallback', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { user } = renderSynopsis({ initial: 'To be cleared' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.common.delete) }));
    await user.click(await screen.findByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ text: null });
  });

  it('performs no PATCH when the clear confirm is cancelled', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const { user } = renderSynopsis({ initial: 'Stays put' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.common.delete) }));
    await user.click(await screen.findByRole('button', { name: t.common.cancel }));
    await waitFor(() => expect(screen.queryByRole('button', { name: t.common.confirm })).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Stays put')).toBeInTheDocument();
  });

  it('surfaces an error toast when the clear PATCH fails', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(errorResponse('clear boom'));
    const { user } = renderSynopsis({ initial: 'Clear failure' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.common.delete) }));
    await user.click(await screen.findByRole('button', { name: t.common.confirm }));
    await waitFor(() => expect(screen.getByText('clear boom')).toBeInTheDocument());
  });
});
