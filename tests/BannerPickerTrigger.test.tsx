// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BannerPickerTrigger } from '@/components/BannerPickerTrigger';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const t = dictionaries.fr;

describe('BannerPickerTrigger', () => {
  it('opens the resident banner picker with the scoped VN identity', () => {
    const listener = vi.fn();
    window.addEventListener('vn:open-banner-picker', listener as EventListener);
    renderWithProviders(<BannerPickerTrigger vnId="v90001" className="custom-trigger" />);
    const trigger = screen.getByRole('button', { name: t.bannerPicker.open });
    expect(trigger.className).toContain('custom-trigger');
    expect(trigger.getAttribute('title')).toBe(t.bannerPicker.openTitle);
    fireEvent.click(trigger);
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ vnId: 'v90001' });
    window.removeEventListener('vn:open-banner-picker', listener as EventListener);
  });

  it('renders a custom empty-state label', () => {
    renderWithProviders(
      <BannerPickerTrigger vnId="v90002" className="empty-banner" label={t.banner.uploadCta} />,
    );
    expect(screen.getByRole('button', { name: t.banner.uploadCta }).getAttribute('title')).toBe(
      t.bannerPicker.openTitle,
    );
  });
});
