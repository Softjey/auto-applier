/** Lowercase, strip diacritics, collapse whitespace and punctuation runs. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ł/g, 'l')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export const clean = (text: string | null | undefined): string =>
  (text ?? '').replace(/\s+/g, ' ').trim();
