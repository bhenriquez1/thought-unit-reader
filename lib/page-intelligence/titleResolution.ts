export function sanitizeTitle(raw: string | null | undefined, fallback = 'Current Page'): string {
  const input = (raw || '').replace(/\s+/g, ' ').trim();
  if (!input) return fallback;

  let cleaned = input
    .replace(/\b(page|pg\.?|p\.)\s*\d+\b/gi, '')
    .replace(/[\s\-:|]*\d+\s*$/g, '')
    .replace(/\[(?:\d+|citation needed)\]/gi, '')
    .replace(/\(\d+\)$/g, '')
    .replace(/([A-Za-z][A-Za-z\s]{3,})\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = cleaned.split(' ').filter(Boolean);
  if (tokens.length < 2 && input.length > cleaned.length) {
    cleaned = input;
  }

  if (cleaned.length < 4) return fallback;
  return cleaned;
}

export function resolvePageHeading(options: Array<string | null | undefined>, fallback = 'Current Page'): string {
  for (const candidate of options) {
    const resolved = sanitizeTitle(candidate, '');
    if (resolved) return resolved;
  }
  return fallback;
}
