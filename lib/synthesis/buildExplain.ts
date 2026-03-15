export function buildExplain(context: { mergedText: string }) {
  const text = (context.mergedText || '').trim();
  return text.slice(0, 800);
}
