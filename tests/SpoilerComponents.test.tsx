// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpoilerChip } from '@/components/SpoilerChip';
import { SpoilerReveal } from '@/components/SpoilerReveal';
import { SpoilerToggle } from '@/components/SpoilerToggle';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { DisplaySettings } from '@/lib/settings/client';
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

describe('SpoilerReveal', () => {
  it('masks gated content and previews it transiently on hover and focus', () => {
    renderWithProviders(<SpoilerReveal level={2}>Secret</SpoilerReveal>, { locale: 'en' });
    const wrapper = screen.getByRole('button', { name: t.spoiler.revealOne });
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'hidden');
    expect(screen.getByText('Secret')).toHaveClass('sr-only');

    fireEvent.pointerEnter(wrapper);
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'transient');
    expect(screen.getByText('Secret')).not.toHaveClass('sr-only');
    fireEvent.pointerLeave(wrapper);
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'hidden');
    fireEvent.focus(wrapper);
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'transient');
    fireEvent.blur(wrapper);
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'hidden');
  });

  it('persists reveal state through mouse and keyboard toggles', () => {
    renderWithProviders(<SpoilerReveal level={1} hiddenLabel="Masked">Secret</SpoilerReveal>, { locale: 'en' });
    const wrapper = screen.getByRole('button', { name: 'Masked' });
    fireEvent.click(wrapper, { detail: 0 });
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'hidden');
    fireEvent.click(wrapper, { detail: 1 });
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'revealed');
    fireEvent.click(wrapper, { detail: 1 });
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'hidden');

    fireEvent.keyDown(wrapper, { key: 'ArrowDown' });
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'hidden');
    fireEvent.keyDown(wrapper, { key: 'Enter' });
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'revealed');
    fireEvent.keyDown(wrapper, { key: ' ' });
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'hidden');
  });

  it('supports touch and pen persistence without toggling for mouse pointer-up', () => {
    renderWithProviders(<SpoilerReveal level={1}>Secret</SpoilerReveal>, { locale: 'en' });
    const wrapper = screen.getByRole('button', { name: t.spoiler.revealOne });
    fireEvent.pointerUp(wrapper, { pointerType: 'mouse' });
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'hidden');
    fireEvent.pointerUp(wrapper, { pointerType: 'touch' });
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'revealed');
    fireEvent.pointerUp(wrapper, { pointerType: 'pen' });
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'hidden');
  });

  it('reveals through global, per-section, and ancestor cascade levels', () => {
    settingsMocks.settings = { ...settingsMocks.settings, spoilerLevel: 1 };
    const { rerender } = renderWithProviders(<SpoilerReveal level={1}>Global</SpoilerReveal>, { locale: 'en' });
    expect(screen.getByText('Global').parentElement).toHaveAttribute('data-spoiler-state', 'revealed');

    rerender(<SpoilerReveal level={2} perSectionOverride={2}>Override</SpoilerReveal>);
    expect(screen.getByText('Override').parentElement).toHaveAttribute('data-spoiler-state', 'revealed');

    settingsMocks.settings = { ...settingsMocks.settings, spoilerLevel: 0 };
    rerender(
      <SpoilerReveal level={2}>
        <SpoilerReveal level={1} transientClassName="preview">Nested</SpoilerReveal>
      </SpoilerReveal>,
    );
    const wrappers = document.querySelectorAll('[data-spoiler-state]');
    fireEvent.pointerEnter(wrappers[0] as HTMLElement);
    expect(wrappers[0]).toHaveAttribute('data-spoiler-state', 'transient');
    expect(wrappers[1]).toHaveAttribute('data-spoiler-state', 'revealed');
  });
});

describe('SpoilerChip', () => {
  it('renders ordinary, lie, spoiler, and sexual revealed chip styles', () => {
    const ordinary = renderWithProviders(
      <SpoilerChip level={0} currentSpoilerLevel={0} showSexual href="/tag/g1">Ordinary</SpoilerChip>,
      { locale: 'en' },
    );
    expect(screen.getByRole('link', { name: 'Ordinary' })).toHaveAttribute('href', '/tag/g1');
    const ordinaryWrapper = document.querySelector('[data-spoiler-state]') as HTMLElement;
    fireEvent.keyDown(ordinaryWrapper, { key: 'Enter' });
    fireEvent.click(ordinaryWrapper, { detail: 1 });
    expect(ordinaryWrapper).toHaveAttribute('data-spoiler-state', 'revealed');
    ordinary.unmount();

    const lie = renderWithProviders(
      <SpoilerChip level={0} lie currentSpoilerLevel={0} showSexual href="/tag/g2">Lie</SpoilerChip>,
      { locale: 'en' },
    );
    expect(screen.getByRole('link', { name: /Lie/ })).toHaveAttribute('title', t.detail.tagLie);
    expect(screen.getByText(t.detail.tagLie)).toHaveClass('sr-only');
    lie.unmount();

    const spoiler = renderWithProviders(
      <SpoilerChip level={1} currentSpoilerLevel={1} showSexual href="/tag/g3">Spoiler</SpoilerChip>,
      { locale: 'en' },
    );
    expect(screen.getByRole('link', { name: 'Spoiler' })).toHaveAttribute('title', t.spoiler.title);
    spoiler.unmount();

    renderWithProviders(
      <SpoilerChip level={0} sexual currentSpoilerLevel={0} showSexual href="/tag/g4">Sexual</SpoilerChip>,
      { locale: 'en' },
    );
    expect(screen.getByRole('link', { name: 'Sexual' })).toHaveAttribute('href', '/tag/g4');
  });

  it('previews a hidden spoiler and persists reveal through its reveal and hide buttons', () => {
    renderWithProviders(
      <SpoilerChip level={1} currentSpoilerLevel={0} showSexual href="/tag/g1">Secret tag</SpoilerChip>,
      { locale: 'en' },
    );
    const wrapper = document.querySelector('[data-spoiler-state]') as HTMLElement;
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'hidden');
    expect(screen.getByRole('button', { name: t.spoiler.revealOne })).toHaveAttribute('title', t.spoiler.markupSummary);
    fireEvent.pointerEnter(wrapper);
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'transient');
    expect(screen.getByRole('button', { name: t.spoiler.revealOne })).toHaveAttribute('title', t.spoiler.hideHint);
    fireEvent.pointerLeave(wrapper);
    fireEvent.focus(wrapper);
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'transient');
    fireEvent.blur(wrapper);
    fireEvent.click(screen.getByRole('button', { name: t.spoiler.revealOne }));
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'revealed');
    expect(screen.getByRole('link', { name: 'Secret tag' })).toHaveAttribute('href', '/tag/g1');
    fireEvent.click(screen.getByRole('button', { name: t.spoiler.hideOne }));
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'hidden');
  });

  it('reveals from wrapper mouse click and keyboard while ignoring synthetic click and unrelated keys', () => {
    const { rerender } = renderWithProviders(
      <SpoilerChip level={2} currentSpoilerLevel={0} showSexual href="/tag/g1">Secret</SpoilerChip>,
      { locale: 'en' },
    );
    let wrapper = document.querySelector('[data-spoiler-state]') as HTMLElement;
    fireEvent.click(wrapper, { detail: 0 });
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'hidden');
    fireEvent.click(wrapper, { detail: 1 });
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'revealed');

    rerender(<SpoilerChip key="other" level={2} currentSpoilerLevel={0} showSexual href="/tag/g2">Other</SpoilerChip>);
    wrapper = document.querySelector('[data-spoiler-state]') as HTMLElement;
    fireEvent.keyDown(wrapper, { key: 'ArrowDown' });
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'hidden');
    fireEvent.keyDown(wrapper, { key: 'Enter' });
    expect(wrapper).toHaveAttribute('data-spoiler-state', 'revealed');
  });

  it('uses the sexual-content label when sexual traits remain gated', () => {
    renderWithProviders(
      <SpoilerChip level={0} sexual currentSpoilerLevel={0} showSexual={false} href="/tag/g1">Sexual</SpoilerChip>,
      { locale: 'en' },
    );
    expect(screen.getByText(t.spoiler.showSexual)).toBeInTheDocument();
  });
});

describe('SpoilerToggle', () => {
  it('opens, focuses, mutates all content controls, and dispatches the full-settings event', () => {
    const openSettings = vi.fn();
    window.addEventListener('vn:open-settings', openSettings);
    renderWithProviders(<SpoilerToggle />, { locale: 'en' });
    const trigger = screen.getByRole('button', { name: t.contentControls.title });
    expect(trigger).toHaveTextContent(t.spoiler.lvl0);
    fireEvent.click(trigger);
    const region = screen.getByRole('region', { name: t.contentControls.title });
    const radios = within(region).getAllByRole('radio');
    expect(document.activeElement).toBe(radios[0]);
    fireEvent.click(radios[1] as HTMLElement);
    expect(settingsMocks.set).toHaveBeenCalledWith('spoilerLevel', 1);

    for (const toggle of within(region).getAllByRole('switch')) fireEvent.click(toggle);
    expect(settingsMocks.set).toHaveBeenCalledWith('hideImages', true);
    expect(settingsMocks.set).toHaveBeenCalledWith('blurR18', false);
    expect(settingsMocks.set).toHaveBeenCalledWith('hideSexual', true);
    expect(settingsMocks.set).toHaveBeenCalledWith('showSexualTraits', true);
    fireEvent.change(within(region).getByRole('slider', { name: t.settings.nsfwThreshold }), { target: { value: '0.7' } });
    expect(settingsMocks.set).toHaveBeenCalledWith('nsfwThreshold', 0.7);

    fireEvent.click(within(region).getByRole('button', { name: t.contentControls.openSettings }));
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region', { name: t.contentControls.title })).not.toBeInTheDocument();
    window.removeEventListener('vn:open-settings', openSettings);
  });

  it('closes on outside click and Escape, then restores trigger focus', () => {
    renderWithProviders(
      <div>
        <SpoilerToggle />
        <button type="button">Outside</button>
      </div>,
      { locale: 'en' },
    );
    const trigger = screen.getByRole('button', { name: t.contentControls.title });
    fireEvent.click(trigger);
    const region = screen.getByRole('region', { name: t.contentControls.title });
    fireEvent.mouseDown(region);
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(screen.getByRole('region', { name: t.contentControls.title })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('region', { name: t.contentControls.title })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: t.contentControls.title })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('renders the lit state when spoilers are enabled or R18 blur is disabled', () => {
    settingsMocks.settings = { ...settingsMocks.settings, spoilerLevel: 1 };
    const { rerender } = renderWithProviders(<SpoilerToggle />, { locale: 'en' });
    expect(screen.getByRole('button', { name: t.contentControls.title })).toHaveTextContent(t.spoiler.lvl1);
    settingsMocks.settings = { ...settingsMocks.settings, spoilerLevel: 0, blurR18: false };
    rerender(<SpoilerToggle />);
    expect(screen.getByRole('button', { name: t.contentControls.title })).toHaveTextContent(t.spoiler.lvl0);
  });
});
