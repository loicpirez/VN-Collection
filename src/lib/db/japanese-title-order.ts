import { compareJapaneseTitles, type JapaneseTitle } from '../japanese-title-order';
import { parseJsonArray } from '../json-shape';
import { isPersistedTitles } from '../vn-persisted-json-shape';

/** Minimal database projection for reading-based ordering before pagination. */
export interface JapaneseTitleDatabaseRow {
  id: string;
  title: string;
  alttitle: string | null;
  title_sort_titles?: string | null;
  title_furigana?: string | null;
}

/** Sort the complete filtered result before applying the requested page window. */
export function paginateJapaneseTitleRows<T extends JapaneseTitleDatabaseRow>(
  rows: T[],
  order: 'asc' | 'desc',
  limit: number,
  offset: number,
): T[] {
  const entries = rows.map((row) => {
    const titles = parseJsonArray(row.title_sort_titles);
    const title: JapaneseTitle = {
      id: row.id,
      title: row.title,
      alttitle: row.alttitle,
      titles: isPersistedTitles(titles) ? titles : [],
      title_reading: row.title_furigana,
    };
    return { row, title };
  });
  entries.sort((a, b) => compareJapaneseTitles(a.title, b.title, order));
  return entries.slice(offset, offset + limit).map((entry) => entry.row);
}
