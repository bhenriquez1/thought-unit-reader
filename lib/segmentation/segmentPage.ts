export type SegmentedBlock = {
  id: string;
  type: 'heading' | 'subsection' | 'paragraph' | 'figure' | 'caption' | 'table' | 'callout';
  text: string;
};

export function segmentPageIntoBlocks(text: string): SegmentedBlock[] {
  const blocks: SegmentedBlock[] = [];
  (text || '').split(/\n{2,}/).forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    const lower = line.toLowerCase();
    const type: SegmentedBlock['type'] =
      /^fig(ure)?\b/.test(lower) ? 'figure' :
      /^table\b/.test(lower) ? 'table' :
      /^(chapter|section)\b/.test(lower) ? 'heading' :
      /^\d+\./.test(lower) ? 'subsection' :
      'paragraph';
    blocks.push({ id: `blk-${idx}`, type, text: line });
  });
  return blocks;
}
