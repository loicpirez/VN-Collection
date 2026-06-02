import { type ReactElement, type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/lib/i18n/client';
import { ToastProvider } from '@/components/ToastProvider';
import { ConfirmProvider } from '@/components/ConfirmDialog';
import { dictionaries, DEFAULT_LOCALE, type Locale } from '@/lib/i18n/dictionaries';

/**
 * Wrap children in the ambient client providers every interactive
 * component expects: locale dictionary, toast API, and the confirm/prompt
 * dialog API. Defaults to the application default locale.
 *
 * @param props Children to render and the locale dictionary to expose.
 */
export function Providers({ children, locale = DEFAULT_LOCALE }: { children: ReactNode; locale?: Locale }) {
  return (
    <I18nProvider locale={locale} dict={dictionaries[locale]}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

interface ProviderRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  locale?: Locale;
}

/**
 * Render a client component inside {@link Providers} and return the
 * Testing Library result plus a ready `userEvent` instance.
 *
 * @param ui Element under test.
 * @param opts Optional locale plus passthrough Testing Library options.
 * @returns The render result extended with a `user` event helper.
 */
export function renderWithProviders(ui: ReactElement, opts: ProviderRenderOptions = {}) {
  const { locale, ...rest } = opts;
  return {
    user: userEvent.setup(),
    ...render(ui, {
      wrapper: ({ children }: { children: ReactNode }) => <Providers locale={locale}>{children}</Providers>,
      ...rest,
    }),
  };
}
