const ORPHAN_TOKEN = /^\d+$/;

function splitRenderableInput(input: string | string[] | null | undefined): string[] {
  if (!input) return [];
  if (typeof input === 'string') return [input];
  return input
    .filter((part): part is string => typeof part === 'string')
    .flatMap((part) => part.split(/\r?\n+/));
}

export function sanitizeRenderText(input: string | string[] | null | undefined): string {
  const normalized = splitRenderableInput(input)
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ');

  if (!normalized) return '';

  return normalized
    .replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2')
    .replace(/-\s*\n\s*/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter((token) => !ORPHAN_TOKEN.test(token.trim()))
    .join(' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

export function sanitizeRenderList(values: Array<string | string[] | null | undefined> | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((entry) => sanitizeRenderText(entry)).filter((entry) => entry.length > 0);
}
