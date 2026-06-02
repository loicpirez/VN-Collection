import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import NotFound from '@/app/not-found';
import { setLocale } from '@/lib/i18n/actions';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';
import { getDict, getLocale } from '@/lib/i18n/server';

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  set: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => mocks.cookieValue == null ? undefined : { value: mocks.cookieValue }),
    set: mocks.set,
  })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

beforeEach(() => {
  mocks.cookieValue = undefined;
  mocks.set.mockReset();
  mocks.revalidatePath.mockReset();
});

describe('server i18n runtime', () => {
  it('returns the default locale when no supported cookie exists', async () => {
    expect(await getLocale()).toBe(DEFAULT_LOCALE);
    mocks.cookieValue = 'unsupported';
    expect(await getLocale()).toBe(DEFAULT_LOCALE);
  });

  it('returns a supported cookie locale and its dictionary', async () => {
    mocks.cookieValue = 'ja';
    expect(await getLocale()).toBe('ja');
    expect(await getDict()).toBe(dictionaries.ja);
  });

  it('ignores unsupported locale mutations', async () => {
    await Reflect.apply(setLocale, undefined, ['unsupported']);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('persists supported locale mutations and revalidates the layout', async () => {
    await setLocale('en');
    expect(mocks.set).toHaveBeenCalledWith('locale', 'en', expect.objectContaining({
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('renders the shared not-found page with localized navigation', async () => {
    mocks.cookieValue = 'en';
    const html = renderToStaticMarkup(await NotFound());
    expect(html).toContain(dictionaries.en.common.pageNotFound);
    expect(html).toContain(dictionaries.en.nav.library);
    expect(html).toContain('href="/"');
  });
});
