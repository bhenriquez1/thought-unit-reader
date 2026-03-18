const ORPHAN_TOKEN = /^\d+$/;

export function sanitizeRenderText(raw: string | null | undefined): string {
  if (!raw) return '';

  return raw
    .replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2') // dehyphenate wrapped words
    .replace(/\b(\d{1,2})\s+(?=[a-z]{2,})/gi, '') // stray citation numerals
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter((token) => !ORPHAN_TOKEN.test(token.trim()))
    .join(' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

export function sanitizeRenderList(values: Array<string | null | undefined> | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => sanitizeRenderText(value))
    .filter((value) => value.length >= 8);
}
