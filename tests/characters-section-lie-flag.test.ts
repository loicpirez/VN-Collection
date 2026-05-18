/**
 * R5-231 pin: `CharactersSection` passes `lie={tr.lie}` to
 * `<SpoilerChip>` for every trait it renders.
 *
 * The regression chain was:
 *   1. `src/lib/vndb-types.ts:VndbCharacter.traits` was a truncated
 *      `{ id, name, group_name, spoiler, sexual }` shape — no `lie`
 *      field.
 *   2. `CharactersSection` imported that type, iterated `c.traits`,
 *      and emitted `<SpoilerChip … sexual=… >` without `lie`.
 *   3. So the AlertTriangle "lie tag" tooltip never lit up on the
 *      VN page Characters section, even though the character's own
 *      page (`/character/[id]`) handled it correctly (different
 *      data path, full payload).
 *
 * Two parts:
 *   1. The type now carries `lie?: boolean` on each trait entry.
 *   2. The JSX in `CharactersSection` passes `lie={!!tr.lie}` to
 *      the chip.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VndbCharacter } from '@/lib/vndb-types';

describe('VndbCharacter.traits — R5-231 lie flag in type', () => {
  it('accepts a trait with `lie: true`', () => {
    // Smoke test — if the type didn't include `lie`, this would fail
    // typecheck (which the suite already gates).
    const c: VndbCharacter = {
      id: 'c1',
      name: 'Alice',
      original: null,
      aliases: [],
      description: null,
      image: null,
      blood_type: null,
      height: null,
      weight: null,
      bust: null,
      waist: null,
      hips: null,
      cup: null,
      age: null,
      birthday: null,
      sex: null,
      gender: null,
      vns: [],
      traits: [
        { id: 'i1', name: 'Liar', group_name: 'Personality', spoiler: 0, sexual: false, lie: true },
      ],
    };
    expect(c.traits[0].lie).toBe(true);
  });
});

describe('CharactersSection — R5-231 passes lie={tr.lie} to SpoilerChip', () => {
  const src = readFileSync(
    join(__dirname, '..', 'src/components/CharactersSection.tsx'),
    'utf8',
  );

  it('source contains `lie={!!tr.lie}` inside the SpoilerChip render', () => {
    expect(src).toMatch(/lie=\{!!tr\.lie\}/);
  });

  it('the SpoilerChip render in CharactersSection passes a `lie` prop', () => {
    // Find the SpoilerChip JSX block for trait chips and assert
    // it contains a `lie=` attribute somewhere in its prop list.
    const chipMatch = src.match(/<SpoilerChip[\s\S]*?<\/SpoilerChip>/);
    expect(chipMatch).not.toBeNull();
    expect(chipMatch![0]).toMatch(/\blie=/);
  });
});
