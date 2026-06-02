// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider, useLocale, useT } from '@/lib/i18n/client';
import { dictionaries } from '@/lib/i18n/dictionaries';

function LocaleConsumer() {
  const locale = useLocale();
  const t = useT();
  return <p>{locale}:{t.common.dismiss}</p>;
}

function MissingDictionaryProvider() {
  useT();
  return null;
}

function MissingLocaleProvider() {
  useLocale();
  return null;
}

afterEach(cleanup);

describe('i18n client runtime', () => {
  it('provides the selected locale and dictionary', () => {
    render(
      <I18nProvider locale="ja" dict={dictionaries.ja}>
        <LocaleConsumer />
      </I18nProvider>,
    );
    expect(screen.getByText(`ja:${dictionaries.ja.common.dismiss}`)).toBeInTheDocument();
  });

  it('rejects dictionary consumers outside the provider', () => {
    expect(() => render(<MissingDictionaryProvider />)).toThrow('useT must be used within I18nProvider');
  });

  it('rejects locale consumers outside the provider', () => {
    expect(() => render(<MissingLocaleProvider />)).toThrow('useLocale must be used within I18nProvider');
  });
});
