/**
 * Section-layout config for `/staff/[id]`. Same shape as
 * vn-detail-layout / series-detail-layout, built via the shared
 * `createSectionLayoutModule` factory in `section-layout.ts`.
 *
 * The main identity row (name, photo, top-line metadata) is NOT
 * customizable — only the below-main sections are.
 */
import { createSectionLayoutModule } from './section-layout';

/**
 * Customizable below-main sections on /staff/[id]. The identity row
 * (name, gender chip, language chip, aliases / description /
 * extlinks inside the header card) is fixed per the operator's
 * "main identity stays fixed" rule.
 */
export const STAFF_SECTION_IDS = [
  'timeline',
  'voice-credits',
  'production-credits',
  'extra-credits',
] as const;

export type StaffSectionId = (typeof STAFF_SECTION_IDS)[number];

const mod = createSectionLayoutModule<StaffSectionId>({
  sectionIds: STAFF_SECTION_IDS,
  scope: 'staff_detail',
  eventName: 'staff:detail-layout-changed',
});

export const defaultStaffDetailLayoutV1 = mod.defaultLayout;
export const validateStaffDetailLayoutV1 = mod.validate;
export const parseStaffDetailLayoutV1 = mod.parse;
export const STAFF_DETAIL_LAYOUT_EVENT = mod.LAYOUT_EVENT;
export const STAFF_DETAIL_SETTINGS_KEY = mod.SETTINGS_KEY;
export type StaffDetailLayoutV1 = ReturnType<typeof defaultStaffDetailLayoutV1>;
