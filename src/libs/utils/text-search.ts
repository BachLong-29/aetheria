/**
 * Lowercases and strips diacritics ("Ăn trưa" -> "an trua", "Đi chợ" -> "di cho") so a search
 * term typed without accents still finds text written with them.
 */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

/** True when `text` contains `query`, ignoring case and diacritics. An empty query matches. */
export function matchesQuery(text: string, query: string): boolean {
  const needle = fold(query.trim());
  return !needle || fold(text).includes(needle);
}

/** Every accented spelling of each plain letter, taken from the Latin blocks (both cases). */
const VARIANTS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (let code = 0xc0; code <= 0x1ef9; code += 1) {
    const char = String.fromCharCode(code);
    const plain = fold(char);
    if (!/^[a-z]$/.test(plain)) continue;
    map[plain] = (map[plain] ?? '') + char.toLowerCase() + char.toUpperCase();
  }
  return map;
})();

/**
 * A MongoDB `$regex` source that matches `query` ignoring case and diacritics: "an" matches
 * "Ăn" and "ăn". Mongo cannot fold accents itself, so each letter becomes a class of its
 * spellings. The query is escaped, so it is always a literal.
 */
export function diacriticRegex(query: string): string {
  return [...fold(query.trim())]
    .map((char) => {
      if (/[.*+?^${}()|[\]\\-]/.test(char)) return `\\${char}`;
      const variants = VARIANTS[char];
      return variants ? `[${char}${char.toUpperCase()}${variants}]` : char;
    })
    .join('');
}
