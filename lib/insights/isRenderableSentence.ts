export function isRenderableSentence(input: string): boolean {
  const text = (input || "").trim();
  if (!text) return false;
  if (text.endsWith("...")) return false;
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 5 && !/^[A-Z][A-Za-z0-9\s\-:]+$/.test(text)) return false;
  if (/\b(and|or|but|so|because|whereas)\.?$/i.test(text)) return false;
  if (/[^\w\s.,:;!?()\-/%]/.test(text) && /[^\w\s]/.test(text.slice(0, 3))) return false;
  return true;
}

export function sanitizePrimarySentence(input: string, fallback: string): string {
  return isRenderableSentence(input) ? input : fallback;
}
