const ORPHAN_TOKEN = /^\d+$/;

function flattenRenderableText(input: unknown): string[] {
  if (input == null) return [];
  if (typeof input === 'string') return [input];
  if (Array.isArray(input)) {
    return input.flatMap((item) => flattenRenderableText(item));
  }
  if (typeof input === 'object') {
    const record = input as Record<string, unknown>;
    return flattenRenderableText(record.text ?? record.content);
  }
  return [];
}

export function normalizeRenderableText(input: unknown): string | null {
  const pieces = flattenRenderableText(input)
    .map((part) => part.trim())
    .filter(Boolean);
  if (pieces.length === 0) return null;
  return pieces.join(' ');
}

export function sanitizeRenderText(raw: string | string[] | null | undefined): string {
  const normalized = normalizeRenderableText(raw);
  if (!normalized) return '';

  return normalized
    .replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2') // dehyphenate wrapped words across line wraps
    .replace(/-\s*\n\s*/g, '') // repair broken OCR line-break hyphen splits
    .replace(/\s*\n\s*/g, ' ') // flatten line breaks into spaces
    .replace(/\b(\d{1,2})\s+(?=[a-z]{2,})/gi, '') // stray citation numerals
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter((token) => !ORPHAN_TOKEN.test(token.trim()))
    .join(' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

export function sanitizeRenderList(values: Array<string | string[] | null | undefined> | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => sanitizeRenderText(value))
    .filter((value) => value.length >= 8);
}
