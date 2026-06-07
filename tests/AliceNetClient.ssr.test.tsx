import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AliceNetClient } from '@/components/AliceNetClient';
import { ConfirmProvider } from '@/components/ConfirmDialog';
import { ToastProvider } from '@/components/ToastProvider';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { I18nProvider } from '@/lib/i18n/client';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/stock',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

describe('AliceNetClient SSR', () => {
  it('renders the stock client shell without reading browser-only preferences', () => {
    const html = renderToString(
      <I18nProvider locale="en" dict={dictionaries.en}>
        <ToastProvider>
          <ConfirmProvider>
            <DisplaySettingsProvider>
              <AliceNetClient />
            </DisplaySettingsProvider>
          </ConfirmProvider>
        </ToastProvider>
      </I18nProvider>,
    );
    expect(html).toContain('Stock AliceNet');
    expect(html).toContain('Loading');
  });
});
