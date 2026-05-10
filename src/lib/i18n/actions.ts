'use server';
import { cookies } from 'next/headers';
import { LOCALES, type Locale } from './dictionaries';
import { revalidatePath } from 'next/cache';

export async function setLocale(loc: Locale): Promise<void> {
  if (!(LOCALES as readonly string[]).includes(loc)) return;
  const store = await cookies();
  store.set('locale', loc, { path: '/', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/', 'layout');
}
