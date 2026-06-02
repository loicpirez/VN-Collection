// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { OwnedEditions } from '@/components/edit-form/OwnedEditions';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.fr;

function baseProps() {
  return {
    location: 'jp' as const,
    onLocationChange: vi.fn(),
    editionType: 'physical' as const,
    onEditionTypeChange: vi.fn(),
    boxType: 'dvd_case' as const,
    onBoxTypeChange: vi.fn(),
    editionLabel: 'First press',
    onEditionLabelChange: vi.fn(),
    physicalLocations: ['Shelf A'],
    onPhysicalLocationsChange: vi.fn(),
    knownPlaces: ['Shelf A', 'Shelf B'],
    downloadUrl: '',
    onDownloadUrlChange: vi.fn(),
    dumped: false,
    onDumpedChange: vi.fn(),
    dumpedIgnored: false,
    onDumpedIgnoredChange: vi.fn(),
  };
}

describe('OwnedEditions', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the inventory heading and selects reflecting current values', () => {
    renderWithProviders(<OwnedEditions {...baseProps()} />);
    expect(screen.getByText(t.form.inventoryTitle)).toBeTruthy();
    expect((screen.getByDisplayValue(t.locations.jp) as HTMLSelectElement).value).toBe('jp');
    expect((screen.getByDisplayValue(t.editions.physical) as HTMLSelectElement).value).toBe('physical');
    expect((screen.getByDisplayValue(t.boxTypes.dvd_case) as HTMLSelectElement).value).toBe('dvd_case');
    expect((screen.getByDisplayValue('First press') as HTMLInputElement).value).toBe('First press');
  });

  it('fires select + text handlers', () => {
    const props = baseProps();
    renderWithProviders(<OwnedEditions {...props} />);
    fireEvent.change(screen.getByDisplayValue(t.locations.jp), { target: { value: 'fr' } });
    expect(props.onLocationChange).toHaveBeenCalledWith('fr');
    fireEvent.change(screen.getByDisplayValue(t.editions.physical), { target: { value: 'digital' } });
    expect(props.onEditionTypeChange).toHaveBeenCalledWith('digital');
    fireEvent.change(screen.getByDisplayValue(t.boxTypes.dvd_case), { target: { value: 'large' } });
    expect(props.onBoxTypeChange).toHaveBeenCalledWith('large');
    fireEvent.change(screen.getByDisplayValue('First press'), { target: { value: 'Limited' } });
    expect(props.onEditionLabelChange).toHaveBeenCalledWith('Limited');
  });

  it('fires download-url handler and renders the existing physical location tag', () => {
    const props = baseProps();
    renderWithProviders(<OwnedEditions {...props} />);
    const urlInput = screen.getByLabelText(t.form.downloadUrl);
    fireEvent.change(urlInput, { target: { value: 'https://example.com/dl' } });
    expect(props.onDownloadUrlChange).toHaveBeenCalledWith('https://example.com/dl');
    expect(screen.getByText('Shelf A')).toBeTruthy();
  });

  it('toggles the two dumped checkboxes', () => {
    const props = baseProps();
    renderWithProviders(<OwnedEditions {...props} />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    fireEvent.click(checkboxes[0]);
    expect(props.onDumpedChange).toHaveBeenCalledWith(true);
    fireEvent.click(checkboxes[1]);
    expect(props.onDumpedIgnoredChange).toHaveBeenCalledWith(true);
  });
});
