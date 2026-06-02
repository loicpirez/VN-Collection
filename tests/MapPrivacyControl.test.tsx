// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapPrivacyControl } from '@/components/MapPrivacyControl';
import {
  MAP_EXTERNAL_NETWORK_CHANGED_EVENT,
  MAP_EXTERNAL_NETWORK_CONSENT_KEY,
  MAP_PRIVACY_NOTICE_DISMISSED_KEY,
  readMapExternalNetworkConsent,
  readMapPrivacyNoticeDismissed,
  writeMapExternalNetworkConsent,
  writeMapPrivacyNoticeDismissed,
} from '@/lib/map-privacy';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const t = dictionaries.en;

beforeEach(() => {
  window.localStorage.clear();
  writeMapExternalNetworkConsent(false);
  writeMapPrivacyNoticeDismissed(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MapPrivacyControl', () => {
  it('enables and disables external requests while synchronizing open controls', async () => {
    const onChange = vi.fn();
    renderWithProviders(<MapPrivacyControl onChange={onChange} />, { locale: 'en' });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(false));
    const enable = screen.getByRole('button', { name: t.map.externalPrivacyEnable });
    expect(enable).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(enable);

    await waitFor(() => expect(screen.getByRole('button', { name: t.map.externalPrivacyDisable })).toBeInTheDocument());
    expect(readMapExternalNetworkConsent()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: t.map.externalPrivacyDisable }));

    await waitFor(() => expect(screen.getByRole('button', { name: t.map.externalPrivacyEnable })).toBeInTheDocument());
    expect(readMapExternalNetworkConsent()).toBe(false);
  });

  it('reads persisted state and accepts event detail from another control', async () => {
    window.localStorage.setItem(MAP_EXTERNAL_NETWORK_CONSENT_KEY, 'true');
    const onChange = vi.fn();
    renderWithProviders(<MapPrivacyControl compact onChange={onChange} />, { locale: 'en' });

    await waitFor(() => expect(screen.getByRole('button', { name: t.map.externalPrivacyDisable })).toBeInTheDocument());
    window.dispatchEvent(new CustomEvent(MAP_EXTERNAL_NETWORK_CHANGED_EVENT, { detail: false }));
    await waitFor(() => expect(screen.getByRole('button', { name: t.map.externalPrivacyEnable })).toBeInTheDocument());

    window.localStorage.setItem(MAP_EXTERNAL_NETWORK_CONSENT_KEY, 'true');
    window.dispatchEvent(new Event(MAP_EXTERNAL_NETWORK_CHANGED_EVENT));
    await waitFor(() => expect(screen.getByRole('button', { name: t.map.externalPrivacyDisable })).toBeInTheDocument());
  });

  it('dismisses and restores the privacy explanation', async () => {
    renderWithProviders(<MapPrivacyControl />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.map.externalPrivacyDismiss }));

    await waitFor(() => expect(screen.getByRole('button', { name: t.map.externalPrivacyShow })).toBeInTheDocument());
    expect(readMapPrivacyNoticeDismissed()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: t.map.externalPrivacyShow }));

    await waitFor(() => expect(screen.getByText(t.map.externalPrivacyTitle)).toBeInTheDocument());
    expect(readMapPrivacyNoticeDismissed()).toBe(false);
  });

  it('starts collapsed when the persisted notice preference is set', async () => {
    window.localStorage.setItem(MAP_PRIVACY_NOTICE_DISMISSED_KEY, 'true');
    renderWithProviders(<MapPrivacyControl />, { locale: 'en' });
    await waitFor(() => expect(screen.getByRole('button', { name: t.map.externalPrivacyShow })).toBeInTheDocument());
  });
});

describe('map privacy storage fallbacks', () => {
  it('falls back to in-memory values when local storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    writeMapExternalNetworkConsent(true);
    writeMapPrivacyNoticeDismissed(true);

    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(readMapExternalNetworkConsent()).toBe(true);
    expect(readMapPrivacyNoticeDismissed()).toBe(true);

    getItem.mockRestore();
    window.localStorage.clear();
    expect(readMapExternalNetworkConsent()).toBe(true);
    expect(readMapPrivacyNoticeDismissed()).toBe(true);
  });
});
