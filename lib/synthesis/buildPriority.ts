export function buildPriority(context: { detectedSectionTitle: string | null; mergedText: string; headings: string[] }) {
  const sentences = (context.mergedText || '').split(/(?<=[.!?])\s+/).filter(Boolean);
  return {
    currentPageFocus: context.detectedSectionTitle || context.headings[0] || 'Current page focus',
    topPriorities: sentences.slice(0, 4),
    whyTheseMatter: sentences[4] || 'These points anchor what matters most on this page for conceptual and exam understanding.',
  };
}
