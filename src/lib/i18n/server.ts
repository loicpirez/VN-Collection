import 'server-only';
import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALES, type Locale, dictionaries, type Dictionary } from './dictionaries';

const COOKIE = 'locale';

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const v = store.get(COOKIE)?.value;
  if (v && (LOCALES as readonly string[]).includes(v)) return v as Locale;
  return DEFAULT_LOCALE;
}

export async function getDict(): Promise<Dictionary> {
  const loc = await getLocale();
  return dictionaries[loc];
}
