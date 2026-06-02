// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterMetaClient } from '@/components/CharacterMetaClient';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { DisplaySettings } from '@/lib/settings/client';
import type { VndbCharacter } from '@/lib/vndb';
import { renderWithProviders } from './helpers/render-component';

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

vi.mock('@/lib/settings/client', () => ({
  useDisplaySettings: () => settingsMocks,
}));

const t = dictionaries.en;
type CharacterMeta = Pick<VndbCharacter, 'id' | 'sex' | 'gender' | 'traits'>;

function makeChar(overrides: Partial<CharacterMeta> = {}): CharacterMeta {
  return {
    id: 'c1',
    sex: null,
    gender: null,
    traits: [],
    ...overrides,
  };
}

beforeEach(() => {
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
  settingsMocks.set.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('CharacterMetaClient', () => {
  it('renders nothing when the public and spoiler metadata do not differ', () => {
    const { container, rerender } = renderWithProviders(<CharacterMetaClient char={makeChar()} />, { locale: 'en' });
    expect(container).toBeEmptyDOMElement();

    rerender(<CharacterMetaClient char={makeChar({ sex: ['f', 'f'], gender: ['m', 'm'] })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('previews, persists, hides, and globally reveals spoiler metadata rows', () => {
    const char = makeChar({ sex: ['m', 'f'], gender: ['m', 'o'] });
    const { rerender } = renderWithProviders(<CharacterMetaClient char={char} />, { locale: 'en' });
    let revealButtons = screen.getAllByRole('button', { name: t.spoiler.revealOne });
    const sexReveal = revealButtons[0] as HTMLButtonElement;
    expect(sexReveal).toHaveAttribute('data-spoiler-state', 'hidden');
    expect(sexReveal).toHaveTextContent(t.spoiler.markupSummary);

    fireEvent.pointerEnter(sexReveal);
    expect(sexReveal).toHaveAttribute('data-spoiler-state', 'transient');
    expect(sexReveal).toHaveTextContent(t.characters.genderF);
    fireEvent.pointerLeave(sexReveal);
    fireEvent.focus(sexReveal);
    expect(sexReveal).toHaveTextContent(t.characters.genderF);
    fireEvent.blur(sexReveal);
    fireEvent.click(sexReveal);
    expect(screen.getByText(t.characters.genderF)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: t.spoiler.hideOne })[0] as HTMLButtonElement);

    settingsMocks.settings = { ...settingsMocks.settings, spoilerLevel: 1 };
    rerender(<CharacterMetaClient char={char} />);
    expect(screen.queryByRole('button', { name: t.spoiler.revealOne })).not.toBeInTheDocument();
    expect(screen.getByText(t.characters.genderF)).toBeInTheDocument();
    expect(screen.getByText(t.characters.genderO)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: t.spoiler.hideOne })[0] as HTMLButtonElement);
    revealButtons = screen.getAllByRole('button', { name: t.spoiler.revealOne });
    expect(revealButtons[0]).toHaveTextContent(t.spoiler.markupSummary);
  });

  it('renders trait status, group labels, id fallback, and spoiler-level labels', () => {
    const char = makeChar({
      traits: [
        { id: 'i1', name: 'Visible', group_name: 'Group', spoiler: 0, sexual: false },
        { id: 'i2', spoiler: 1, sexual: false },
        { id: 'i3', name: 'Sexual', spoiler: 0, sexual: true },
      ],
    });
    const { rerender } = renderWithProviders(<CharacterMetaClient char={char} />, { locale: 'en' });
    expect(screen.getByText(`${t.spoiler.title}: ${t.spoiler.lvl0} / ${t.spoiler.hideSexual}`)).toBeInTheDocument();
    expect(screen.getByText('Group /')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Visible$/ })).toHaveAttribute('href', '/trait/i1');
    expect(screen.getAllByRole('button', { name: t.spoiler.revealOne })).toHaveLength(2);

    settingsMocks.settings = { ...settingsMocks.settings, spoilerLevel: 1, showSexualTraits: true };
    rerender(<CharacterMetaClient char={char} />);
    expect(screen.getByText(`${t.spoiler.title}: ${t.spoiler.lvl1}`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'i2' })).toHaveAttribute('href', '/trait/i2');
    expect(screen.getByRole('link', { name: 'Sexual' })).toHaveAttribute('href', '/trait/i3');

    settingsMocks.settings = { ...settingsMocks.settings, spoilerLevel: 2 };
    rerender(<CharacterMetaClient char={char} />);
    expect(screen.getByText(`${t.spoiler.title}: ${t.spoiler.lvl2}`)).toBeInTheDocument();
  });

  it('maps every supported and unknown real sex or gender value', () => {
    settingsMocks.settings = { ...settingsMocks.settings, spoilerLevel: 1 };
    const cases: { char: CharacterMeta; expected: string }[] = [
      { char: makeChar({ sex: ['f', 'm'] }), expected: t.characters.genderM },
      { char: makeChar({ sex: ['m', 'f'] }), expected: t.characters.genderF },
      { char: makeChar({ sex: ['m', 'b'] }), expected: `${t.characters.genderM} / ${t.characters.genderF}` },
      { char: makeChar({ sex: ['m', 'n'] }), expected: t.common.none },
      { char: makeChar({ sex: ['m', 'custom-sex'] }), expected: 'custom-sex' },
      { char: makeChar({ gender: ['f', 'm'] }), expected: t.characters.genderM },
      { char: makeChar({ gender: ['m', 'f'] }), expected: t.characters.genderF },
      { char: makeChar({ gender: ['m', 'o'] }), expected: t.characters.genderO },
      { char: makeChar({ gender: ['m', 'a'] }), expected: t.characters.genderA },
      { char: makeChar({ gender: ['m', 'custom-gender'] }), expected: 'custom-gender' },
    ];

    for (const entry of cases) {
      const { unmount } = renderWithProviders(<CharacterMetaClient char={entry.char} />, { locale: 'en' });
      expect(screen.getByText(entry.expected)).toBeInTheDocument();
      unmount();
    }
  });
});
