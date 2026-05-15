/**
 * VNDB staff role enum → i18n dictionary key under `staff.role_*`.
 * Used by every surface that displays a credit role (StaffSection,
 * StaffExtraCredits, brand-overlap, compare page).
 */
export const ROLE_ORDER = [
  'scenario',
  'chardesign',
  'art',
  'music',
  'songs',
  'director',
  'producer',
  'staff',
] as const;

export type RoleI18nKey =
  | 'role_scenario'
  | 'role_chardesign'
  | 'role_art'
  | 'role_music'
  | 'role_songs'
  | 'role_director'
  | 'role_producer'
  | 'role_staff';

export const ROLE_KEY: Record<string, RoleI18nKey> = {
  scenario: 'role_scenario',
  chardesign: 'role_chardesign',
  art: 'role_art',
  music: 'role_music',
  songs: 'role_songs',
  director: 'role_director',
  producer: 'role_producer',
  staff: 'role_staff',
};

export function roleLabel(
  role: string | null | undefined,
  staffDict: Record<RoleI18nKey, string>,
): string {
  const key = role ? ROLE_KEY[role] : null;
  return key ? staffDict[key] : (role ?? '');
}
