export function scoreExtractionQuality(text: string): number {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 0;
  const words = normalized.match(/[A-Za-z]{3,}/g)?.length ?? 0;
  const sentenceMarks = normalized.match(/[.!?]/g)?.length ?? 0;
  const broken = normalized.match(/[A-Za-z]-\s+[A-Za-z]/g)?.length ?? 0;
  return Math.max(0, Math.min(100, Math.round(Math.min(60, normalized.length / 8) + Math.min(25, words / 3) + Math.min(20, sentenceMarks * 2) - Math.min(30, broken * 6))));
}

export function shouldFallbackToOCR(text: string, threshold: number = 35): boolean {
  return scoreExtractionQuality(text) < threshold;
}
