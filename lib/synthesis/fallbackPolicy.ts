export function canSynthesizePage(confidence: number, mergedText: string): boolean {
  const text = (mergedText || '').trim();
  if (!text) return false;
  return confidence >= 25 && text.length >= 60;
}

export function getFallbackDisplayState() {
  return {
    message: 'This page could not be confidently parsed yet.',
    actions: ['Retry OCR', 'Show heading-only view', 'Show figure/caption-only view', 'Jump to source'],
  };
}
