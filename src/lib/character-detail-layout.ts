/**
 * Section-layout config for `/character/[id]`. See section-layout.ts.
 *
 * Main identity row (name, photo, alias chips) is fixed; only the
 * below-main sections are reorder/hide/collapse-able.
 */
import { createSectionLayoutModule } from './section-layout';

export const CHARACTER_SECTION_IDS = [
  'siblings',
  'description',
  'meta',
  'instances',
  'voiced-by-all',
  'also-voiced-by',
  'appears-in',
] as const;

export type CharacterSectionId = (typeof CHARACTER_SECTION_IDS)[number];

const mod = createSectionLayoutModule<CharacterSectionId>({
  sectionIds: CHARACTER_SECTION_IDS,
  scope: 'character_detail',
  eventName: 'character:detail-layout-changed',
});

export const defaultCharacterDetailLayoutV1 = mod.defaultLayout;
export const validateCharacterDetailLayoutV1 = mod.validate;
export const parseCharacterDetailLayoutV1 = mod.parse;
export const CHARACTER_DETAIL_LAYOUT_EVENT = mod.LAYOUT_EVENT;
export const CHARACTER_DETAIL_SETTINGS_KEY = mod.SETTINGS_KEY;
export type CharacterDetailLayoutV1 = ReturnType<typeof defaultCharacterDetailLayoutV1>;
