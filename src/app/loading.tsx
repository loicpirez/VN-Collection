import { HomePageSkeleton } from '@/components/HomePageSkeleton';
import { getAppSettingRepository } from '@/lib/db/repositories/app-setting';
import { parseHomeSectionLayoutV1 } from '@/lib/home-section-layout';
import { getDict } from '@/lib/i18n/server';

export default async function HomeLoading() {
  const t = await getDict();
  let layout: ReturnType<typeof parseHomeSectionLayoutV1>;
  try {
    layout = parseHomeSectionLayoutV1(
      await getAppSettingRepository().get('home_section_layout_v1'),
    );
  } catch {
    layout = parseHomeSectionLayoutV1(null);
  }
  return <HomePageSkeleton layout={layout} label={t.app.loading} />;
}
