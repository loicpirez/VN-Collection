'use client';
import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TagPicker } from './TagPicker';
import { useT } from '@/lib/i18n/client';

interface SeedTag {
  id: string;
  name: string;
  /** Optional weight from the auto-derivation; the picker doesn't display it. */
  weight?: number;
}

/**
 * Client wrapper around <TagPicker> that pushes the picked tag list
 * into a URL search param ("tags=g123,g456"). The server page parses
 * the same param and passes it to `recommendVns({ customTagIds })`.
 *
 * Used by /recommendations and /similar so both pages share the
 * "pick seeds explicitly" UX with no duplication.
 */
export function SeedTagControls({
  initial,
  /** Search-param name to read/write. Defaults to `tags`. */
  paramName = 'tags',
  /** Extra URL params to preserve when navigating (e.g. `ero=1`). */
  preserveParams = [] as string[],
  label,
  hint,
  category,
}: {
  initial: SeedTag[];
  paramName?: string;
  preserveParams?: string[];
  label?: string;
  hint?: string;
  category?: 'cont' | 'ero' | 'tech';
}) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();

  const setTags = useCallback(
    (next: SeedTag[]) => {
      const params = new URLSearchParams();
      // Preserve caller-named params (e.g. include-ero toggle).
      for (const k of preserveParams) {
        const v = searchParams.get(k);
        if (v != null) params.set(k, v);
      }
      const ids = next.map((tag) => tag.id).filter(Boolean);
      if (ids.length > 0) {
        params.set(paramName, ids.join(','));
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [paramName, preserveParams, router, searchParams],
  );

  // The TagPicker only needs id/name/category/vn_count; the autocomplete
  // brings its own results, so we synthesise category/vn_count for the
  // initial chips from the seed payload.
  const asPickerTags = initial.map((seed) => ({
    id: seed.id,
    name: seed.name,
    category: (category ?? 'cont') as 'cont' | 'ero' | 'tech',
    vn_count: 0,
  }));

  return (
    <TagPicker
      tags={asPickerTags}
      onChange={(next) => setTags(next.map((tag) => ({ id: tag.id, name: tag.name })))}
      category={category}
      label={label ?? t.recommend.seedsLabel}
      hint={hint ?? t.recommend.seedsHint}
    />
  );
}
