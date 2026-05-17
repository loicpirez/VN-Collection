import type { Dictionary } from '@/lib/i18n/dictionaries';
import { VnSeedPicker, type SeedChipData } from '@/components/VnSeedPicker';

/**
 * Full-width landing card for `/recommendations?mode=similar-to-vn`
 * when no seed is picked yet (or when the URL seed points at a VN
 * the local DB doesn't know).
 *
 * Renders the in-page VnSeedPicker prominently so the operator never
 * has to touch the URL bar. The "invalid seed" path keeps the same
 * card shape but flags the chip in the error tone so the picker
 * surfaces what was broken without losing the affordance.
 *
 * Server component (no `'use client'`) — the picker itself is a
 * client component and hydrates from this static shell.
 */
export function SimilarSeedEmptyState({
  invalid,
  chip,
  fallbackSeedId,
  t,
}: {
  invalid: boolean;
  chip: SeedChipData | null;
  fallbackSeedId: string | undefined;
  t: Dictionary;
}) {
  // Synthesise a chip from the raw id when the seed is invalid and
  // the local DB has nothing for us. The picker still renders the
  // chip in the error tone so the operator sees what was broken.
  const seedForPicker: SeedChipData | null = chip
    ? chip
    : invalid && fallbackSeedId
      ? { id: fallbackSeedId, title: fallbackSeedId }
      : null;
  return (
    <section
      className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6"
      data-testid="similar-seed-empty"
    >
      <h2 className="text-lg font-bold">
        {t.recommend.modes.similarToVn.emptyHeadline}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {t.recommend.modes.similarToVn.emptyBody}
      </p>
      <div className="mt-4">
        <VnSeedPicker initialSeed={seedForPicker} invalid={invalid} autoFocusInput />
      </div>
    </section>
  );
}
