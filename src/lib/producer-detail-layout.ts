/**
 * Section-layout config for `/producer/[id]`. See section-layout.ts.
 *
 * Identity row (logo, name, language, type) is fixed; below-main
 * sections are customizable.
 */
import { createSectionLayoutModule } from './section-layout';

/**
 * Customizable below-main sections on /producer/[id]. Aliases stay
 * inside the identity header.
 */
export const PRODUCER_SECTION_IDS = [
  'description',
  'extlinks',
  'works',
  'stats',
] as const;

export type ProducerSectionId = (typeof PRODUCER_SECTION_IDS)[number];

const mod = createSectionLayoutModule<ProducerSectionId>({
  sectionIds: PRODUCER_SECTION_IDS,
  scope: 'producer_detail',
  eventName: 'producer:detail-layout-changed',
});

export const defaultProducerDetailLayoutV1 = mod.defaultLayout;
export const validateProducerDetailLayoutV1 = mod.validate;
export const parseProducerDetailLayoutV1 = mod.parse;
export const PRODUCER_DETAIL_LAYOUT_EVENT = mod.LAYOUT_EVENT;
export const PRODUCER_DETAIL_SETTINGS_KEY = mod.SETTINGS_KEY;
export type ProducerDetailLayoutV1 = ReturnType<typeof defaultProducerDetailLayoutV1>;
