export function fixSoftHyphenation(text: string): string {
  return text.replace(/([A-Za-z]{2,})-\s+([a-z]{2,})/g, '$1$2');
}

export function preserveTrueHyphens(text: string): string {
  return text.replace(/\b([A-Za-z]{2,})\s+-\s+([A-Za-z]{2,})\b/g, '$1-$2');
}

export function repairBrokenParagraphs(text: string): string {
  return text.replace(/([^\n.!?:])\n(?=[a-z(])/g, '$1 ').replace(/\n{3,}/g, '\n\n');
}

export function normalizeExtractedText(text: string): string {
  const fixed = fixSoftHyphenation(text || '');
  const repaired = repairBrokenParagraphs(fixed);
  return preserveTrueHyphens(repaired).replace(/[ \t]{2,}/g, ' ').trim();
}
