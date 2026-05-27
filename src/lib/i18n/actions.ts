'use server';
import { cookies } from 'next/headers';
import { LOCALES, type Locale } from './dictionaries';
import { revalidatePath } from 'next/cache';

export async function setLocale(loc: Locale): Promise<void> {
  if (!(LOCALES as readonly string[]).includes(loc)) return;
  const store = await cookies();
  // Audit S-018: explicit SameSite + Secure when HTTPS is in use. The
  // locale value is non-sensitive, but the pattern matters once the
  // app moves off localhost.
  store.set('locale', loc, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: false, // client reads `locale` for the language switcher
    secure: process.env.NODE_ENV === 'production',
  });
  revalidatePath('/', 'layout');
}
