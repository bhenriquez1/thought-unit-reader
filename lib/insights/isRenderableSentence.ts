export function isRenderableSentence(input: string): boolean {
  const text = (input || "").trim();
  if (!text) return false;
  if (/\.\.\.$/.test(text)) return false;
  if (text.split(/\s+/).length < 5) return false;
  if (/\b(and|or|but|so|because|whereas)$/i.test(text)) return false;
  if (!/[.!?:]$/.test(text)) return false;
  return true;
}
