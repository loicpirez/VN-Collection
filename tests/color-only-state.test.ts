/**
 * R5-160 pin: state distinctions never rely on color alone.
 *
 * Where the codebase ships a state-tinted UI (collection status,
 * dumped progress, bulk download outcome, tone-cycle filter
 * buttons, etc.) the color is paired with an icon and / or a
 * text label so colour-blind / monochrome / forced-colors-mode
 * users still get the signal.
 *
 * The R5-160 row cited dumped / bulk / logo / banner. The
 * canonical state-icon pairing is `<StatusIcon status={…}/>`,
 * which renders one of the five Lucide icons (CircleDashed,
 * PlayCircle, CheckCircle2, PauseCircle, XCircle) per `Status`
 * value. This pin asserts:
 *
 *   1. `StatusIcon` maps every `Status` value to a non-null
 *      Lucide icon (no missing entry).
 *   2. The LibraryClient yes/no/off tone-cycle button (one of
 *      the few non-status colored chips) pairs each tone with
 *      a distinct icon (Check / X / Circle).
 *   3. The dumped page summary bar (R5-154 added the
 *      aria-label) keeps the numeric counter on screen as the
 *      non-color cue.
 */
import { describe, expect, it } from 'vitest';
import { STATUSES } from '@/lib/types';
import { STATUS_ICON } from '@/components/StatusIcon';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('R5-160 — state distinctions pair color with icon/text', () => {
  it('STATUS_ICON maps every Status to a Lucide icon', () => {
    for (const s of STATUSES) {
      expect(STATUS_ICON[s], `StatusIcon missing entry for ${s}`).toBeDefined();
      expect(typeof STATUS_ICON[s]).toBe('object');
    }
  });

  it('LibraryClient yes/no/off tone-cycle button has Check / X / Circle icons', () => {
    const src = readFileSync(join(ROOT, 'src/components/LibraryClient.tsx'), 'utf8');
    const block = src.match(/FILTERS\.map\([\s\S]*?<\/button>/);
    expect(block, 'FILTERS map block must exist').not.toBeNull();
    expect(block![0]).toMatch(/<Check\b/);
    expect(block![0]).toMatch(/<X\b/);
    expect(block![0]).toMatch(/<Circle\b/);
  });

  it('dumped per-VN bar keeps a numeric counter alongside the color fill', () => {
    const src = readFileSync(join(ROOT, 'src/app/dumped/page.tsx'), 'utf8');
    // The counter (`{e.dumped_editions}/{e.total_editions}`) is
    // reused as the bar's aria-label per R5-154, so the same
    // text is visible to sighted users + announced to AT.
    expect(src).toMatch(/dumped_editions[\s\S]*?total_editions/);
    // And the bar's class still applies a status-completed /
    // accent fill — color is supplementary, not exclusive.
    expect(src).toMatch(/bg-status-completed/);
  });
});
