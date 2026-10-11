import type { VndbCharacter } from './vndb';

export type TranslationGlossaryRole = 'main' | 'primary' | 'side' | 'appears';

export interface TranslationGlossaryCharacter {
  id: string;
  original: string;
  romaji: string;
  aliases: string[];
  role: TranslationGlossaryRole;
}

export interface TranslationGlossary {
  version: 1;
  source: 'VNCollection/VNDB';
  vnId: string;
  characters: TranslationGlossaryCharacter[];
}

const ROLE_ORDER: Record<TranslationGlossaryRole, number> = {
  main: 0,
  primary: 1,
  side: 2,
  appears: 3,
};

function roleForVn(character: VndbCharacter, vnId: string): TranslationGlossaryRole {
  return character.vns
    .filter((appearance) => appearance.id.toLowerCase() === vnId)
    .map((appearance) => appearance.role)
    .sort((left, right) => ROLE_ORDER[left] - ROLE_ORDER[right])[0] ?? 'appears';
}

export function buildTranslationGlossary(
  vnId: string,
  characters: readonly VndbCharacter[],
): TranslationGlossary {
  const normalizedVnId = vnId.toLowerCase();
  const seen = new Set<string>();
  const rows: TranslationGlossaryCharacter[] = [];
  for (const character of characters) {
    const original = character.original?.trim() ?? '';
    const romaji = character.name.trim();
    if (!original || !romaji) continue;
    const key = `${original}\u0000${romaji}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const aliases = [...new Set(character.aliases.map((alias) => alias.trim()).filter(Boolean))]
      .filter((alias) => alias !== original && alias !== romaji)
      .slice(0, 20);
    rows.push({
      id: character.id.toLowerCase(),
      original,
      romaji,
      aliases,
      role: roleForVn(character, normalizedVnId),
    });
  }
  rows.sort((left, right) =>
    ROLE_ORDER[left.role] - ROLE_ORDER[right.role] ||
    left.original.localeCompare(right.original, 'ja') ||
    left.romaji.localeCompare(right.romaji, 'en'),
  );
  return {
    version: 1,
    source: 'VNCollection/VNDB',
    vnId: normalizedVnId,
    characters: rows,
  };
}
