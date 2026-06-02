// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CharactersSection } from '@/components/CharactersSection';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { DisplaySettings } from '@/lib/settings/client';
import type { VnCharacterRow } from '@/lib/vn-characters-cache';
import { renderWithProviders } from './helpers/render-component';

const sectionMocks = vi.hoisted(() => ({
  count: vi.fn(),
}));

const characterMocks = vi.hoisted(() => ({
  fetch: vi.fn<(vnId: string, signal?: AbortSignal) => Promise<VnCharacterRow[]>>(),
}));

const settingsMocks = vi.hoisted(() => ({
  settings: {
    hideImages: false,
    blurR18: true,
    nsfwThreshold: 1.5,
    preferLocalImages: true,
    preferNativeTitle: false,
    hideSexual: false,
    denseLibrary: false,
    cardDensityPx: 220,
    density: {},
    pageSpace: {},
    headerFollowsPageSpace: false,
    spoilerLevel: 0,
    showSexualTraits: false,
    globalPageSpace: null,
  } as DisplaySettings,
  set: vi.fn(),
}));

vi.mock('@/components/vn-detail/DetailSectionFrame', () => ({
  useSectionCount: sectionMocks.count,
}));

vi.mock('@/lib/vn-characters-cache', () => ({
  fetchVnCharacters: characterMocks.fetch,
}));

vi.mock('@/lib/settings/client', () => ({
  useDisplaySettings: () => settingsMocks,
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ alt, localSrc, sexual, src }: { alt: string; localSrc: string | null; sexual: number | null; src: string | null }) => (
    <span>{`image:${alt}:${src ?? 'none'}:${localSrc ?? 'none'}:${sexual ?? 'none'}`}</span>
  ),
}));

vi.mock('@/components/Skeleton', () => ({
  SkeletonBlock: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

vi.mock('@/components/ErrorAlert', () => ({
  ErrorAlert: ({ children, title }: { children: React.ReactNode; title: string }) => <div>{`${title}: ${children}`}</div>,
}));

vi.mock('@/components/SpoilerChip', () => ({
  SpoilerChip: ({
    children,
    currentSpoilerLevel,
    href,
    lie,
    sexual,
  }: {
    children: React.ReactNode;
    currentSpoilerLevel: number;
    href: string;
    lie: boolean;
    sexual: boolean;
  }) => <a href={href}>{`${currentSpoilerLevel}:${sexual}:${lie}:`}{children}</a>,
}));

const t = dictionaries.en;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: Error) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (reason?: Error) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function character(overrides: Partial<VnCharacterRow> = {}): VnCharacterRow {
  return {
    id: 'c1',
    name: 'Character',
    original: null,
    aliases: [],
    description: null,
    image: null,
    blood_type: null,
    height: null,
    weight: null,
    bust: null,
    waist: null,
    hips: null,
    cup: null,
    age: null,
    birthday: null,
    sex: null,
    gender: null,
    vns: [],
    traits: [],
    localImage: null,
    ...overrides,
  };
}

beforeEach(() => {
  sectionMocks.count.mockReset();
  characterMocks.fetch.mockReset();
  settingsMocks.settings = {
    hideImages: false,
    blurR18: true,
    nsfwThreshold: 1.5,
    preferLocalImages: true,
    preferNativeTitle: false,
    hideSexual: false,
    denseLibrary: false,
    cardDensityPx: 220,
    density: {},
    pageSpace: {},
    headerFollowsPageSpace: false,
    spoilerLevel: 0,
    showSexualTraits: false,
    globalPageSpace: null,
  };
});

afterEach(() => {
  cleanup();
});

describe('CharactersSection', () => {
  it('shows skeletons while loading and an empty state after resolution', async () => {
    const pending = deferred<VnCharacterRow[]>();
    characterMocks.fetch.mockReturnValue(pending.promise);
    renderWithProviders(<CharactersSection vnId="v1" />, { locale: 'en' });

    expect(screen.getAllByTestId('skeleton')).toHaveLength(24);
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(sectionMocks.count).toHaveBeenCalledWith(null);
    expect(characterMocks.fetch).toHaveBeenCalledWith('v1', expect.any(AbortSignal));

    await act(async () => pending.resolve([]));
    expect(screen.getByText(t.characters.empty)).toBeInTheDocument();
    expect(sectionMocks.count).toHaveBeenCalledWith(0);
  });

  it('sorts cards by role and renders optional metadata, images, and trait projections', async () => {
    settingsMocks.settings = { ...settingsMocks.settings, spoilerLevel: 1, showSexualTraits: true };
    const traits = Array.from({ length: 6 }, (_, index) => ({
      id: `i${index}`,
      name: `Trait ${index}`,
      group_name: '',
      spoiler: index,
      sexual: index === 0,
      lie: index === 1,
    }));
    characterMocks.fetch.mockResolvedValue([
      character({ id: 'c-side', name: 'Side', original: 'Side original', vns: [{ id: 'v1', role: 'side', spoiler: 0 }] }),
      character({
        id: 'c-main',
        name: 'Main',
        age: 18,
        height: 160,
        weight: 50,
        blood_type: 'ab',
        image: { url: 'remote.jpg', sexual: 1 },
        localImage: 'local.jpg',
        traits,
        vns: [{ id: 'v1', role: 'main', spoiler: 0 }],
      }),
      character({ id: 'c-primary', name: 'Primary', vns: [{ id: 'v1', role: 'primary', spoiler: 0 }] }),
      character({ id: 'c-appears', name: 'Appears', original: 'Appears', vns: [] }),
    ]);

    renderWithProviders(<CharactersSection vnId="v1" spoilOverride={2} />, { locale: 'en' });
    const items = await screen.findAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Main'),
      expect.stringContaining('Primary'),
      expect.stringContaining('Side'),
      expect.stringContaining('Appears'),
    ]);
    expect(screen.getByText(`18 ${t.characters.years} / 160 cm / 50 kg / AB`)).toBeInTheDocument();
    expect(screen.getByText('Side original')).toBeInTheDocument();
    expect(screen.getByText('image:Main:remote.jpg:local.jpg:1')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^2:/ })).toHaveLength(5);
    expect(screen.queryByText(/Trait 5/)).not.toBeInTheDocument();
    expect(sectionMocks.count).toHaveBeenCalledWith(4);
  });

  it('uses the global spoiler level when no section override exists', async () => {
    settingsMocks.settings = { ...settingsMocks.settings, spoilerLevel: 1 };
    characterMocks.fetch.mockResolvedValue([
      character({ traits: [{ id: 'i1', name: 'Trait', group_name: '', spoiler: 0, sexual: false }] }),
    ]);

    renderWithProviders(<CharactersSection vnId="v1" />, { locale: 'en' });
    expect(await screen.findByRole('link', { name: '1:false:false:Trait' })).toHaveAttribute('href', '/trait/i1');
  });

  it('sorts multiple cameo rows that have no matching VN credit', async () => {
    characterMocks.fetch.mockResolvedValue([
      character({ id: 'c1', name: 'First' }),
      character({ id: 'c2', name: 'Second' }),
    ]);

    renderWithProviders(<CharactersSection vnId="v1" />, { locale: 'en' });
    expect(await screen.findAllByRole('listitem')).toHaveLength(2);
  });

  it('reports non-abort errors and keeps the same VN from fetching twice', async () => {
    characterMocks.fetch.mockRejectedValue(new Error('load failed'));
    const { rerender } = renderWithProviders(<CharactersSection vnId="v1" />, { locale: 'en' });
    expect(await screen.findByText(`${t.common.error}: load failed`)).toBeInTheDocument();
    rerender(<CharactersSection vnId="v1" />);
    expect(characterMocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('ignores stale successful responses after navigation', async () => {
    const first = deferred<VnCharacterRow[]>();
    const second = deferred<VnCharacterRow[]>();
    characterMocks.fetch
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { rerender } = renderWithProviders(<CharactersSection vnId="v1" />, { locale: 'en' });
    rerender(<CharactersSection vnId="v2" />);

    await act(async () => first.resolve([character({ name: 'Stale' })]));
    expect(screen.queryByText('Stale')).not.toBeInTheDocument();
    await act(async () => second.resolve([]));
    expect(screen.getByText(t.characters.empty)).toBeInTheDocument();
  });

  it('aborts stale requests and ignores abort or post-navigation rejections', async () => {
    const first = deferred<VnCharacterRow[]>();
    const second = deferred<VnCharacterRow[]>();
    characterMocks.fetch
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { rerender } = renderWithProviders(<CharactersSection vnId="v1" />, { locale: 'en' });
    const firstSignal = characterMocks.fetch.mock.calls[0]?.[1];
    rerender(<CharactersSection vnId="v2" />);
    expect(firstSignal?.aborted).toBe(true);

    await act(async () => first.reject(new Error('late failure')));
    expect(screen.queryByText(`${t.common.error}: late failure`)).not.toBeInTheDocument();
    await act(async () => second.resolve([]));
    expect(screen.getByText(t.characters.empty)).toBeInTheDocument();

    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    characterMocks.fetch.mockRejectedValueOnce(abortError);
    rerender(<CharactersSection vnId="v3" />);
    await act(async () => undefined);
    expect(screen.queryByText(`${t.common.error}: aborted`)).not.toBeInTheDocument();
  });
});
