import type { CharacterDef } from "@/lib/characters";

export interface ArppCharacterEntry {
  id: string;
  name: string;
  aliases: string[];
  colorIndex?: number;
}

export function slugifyCharacterId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''.]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "character";
}

function colorIndexFromVar(colorVar: string): number | undefined {
  const m = colorVar.match(/--char-(\d+)/);
  return m ? parseInt(m[1], 10) : undefined;
}

/** Stable `id` per canonical name; disambiguate slug collisions with `_2`, `_3`, … */
export function buildCharacterIdMap(characters: CharacterDef[]): {
  nameToId: Map<string, string>;
  roster: ArppCharacterEntry[];
} {
  const nameToId = new Map<string, string>();
  const used = new Set<string>();
  const roster: ArppCharacterEntry[] = [];

  for (const c of characters) {
    const base = slugifyCharacterId(c.name);
    let id = base;
    let n = 2;
    while (used.has(id)) {
      id = `${base}_${n++}`;
    }
    used.add(id);
    nameToId.set(c.name, id);
    roster.push({
      id,
      name: c.name,
      aliases: c.aliases,
      colorIndex: colorIndexFromVar(c.colorVar),
    });
  }

  return { nameToId, roster };
}

export function nameFromCharacterId(
  id: string,
  roster: ArppCharacterEntry[],
): string | null {
  const hit = roster.find((c) => c.id === id);
  return hit?.name ?? null;
}
