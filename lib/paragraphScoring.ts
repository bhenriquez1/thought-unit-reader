import type { ParagraphKind, ParagraphSignal } from "@/lib/readerContracts";
import type { RawBlock } from "@/lib/paragraphSegmentation";

const definitionWords = /(is defined as|defined as|characterized by|classification|classified into|refers to)/i;
const mechanismWords = /(because|results in|leads to|causes|therefore|pathway|mechanism|if\s+.+\s+then)/i;
const clinicalWords = /(diagnosis|treatment|symptom|sign|contraindication|radiographic|lesion|pulp|pain|pathology|prognosis)/i;
const comparisonWords = /(versus|vs\.?|unlike|in contrast|compared with|differ|distinguish)/i;
const formulaWords = /(=|\^|√|\b[a-z]_\d|\d+\/\d+|formula|equation|ratio|polynomial)/i;
const applicationWords = /(apply|clinical implication|management|use in practice|question|exam|trap|must know)/i;
const referenceWords = /(doi|et al\.|references|bibliography|copyright)/i;
const fillerWords = /(in general|throughout the years|it is important to remember|background|historically|acknowledg)/i;

function kindFor(text: string): ParagraphKind {
  if (referenceWords.test(text)) return "reference";
  if (formulaWords.test(text)) return "formula";
  if (clinicalWords.test(text)) return "clinical";
  if (comparisonWords.test(text)) return "comparison";
  if (mechanismWords.test(text)) return "mechanism";
  if (definitionWords.test(text)) return "definition";
  if (applicationWords.test(text)) return "application";
  if (fillerWords.test(text)) return "filler";
  return "unknown";
}

export function scoreParagraphs(blocks: RawBlock[], page: number): ParagraphSignal[] {
  return blocks.map((block) => {
    const text = block.text;
    const definitionScore = definitionWords.test(text) ? 1 : 0;
    const mechanismScore = mechanismWords.test(text) ? 1 : 0;
    const clinicalScore = clinicalWords.test(text) ? 1 : 0;
    const comparisonScore = comparisonWords.test(text) ? 1 : 0;
    const examScore = applicationWords.test(text) || /\bquiz|exam|dat|test\b/i.test(text) ? 1 : 0;
    const formulaScore = formulaWords.test(text) ? 1 : 0;
    const fillerPenalty = fillerWords.test(text) || block.blockType === "metadata" ? 1 : 0;

    const yieldScore =
      definitionScore * 1.2 +
      mechanismScore * 1.4 +
      clinicalScore * 1.5 +
      comparisonScore * 1.2 +
      examScore * 1.6 +
      formulaScore * 1.3 -
      fillerPenalty * 1.5;

    const evidenceTerms = [
      ...(definitionWords.test(text) ? ["definition"] : []),
      ...(mechanismWords.test(text) ? ["mechanism"] : []),
      ...(clinicalWords.test(text) ? ["clinical"] : []),
      ...(comparisonWords.test(text) ? ["compare"] : []),
      ...(formulaWords.test(text) ? ["formula"] : []),
      ...(applicationWords.test(text) ? ["exam"] : []),
    ];

    return {
      text,
      page,
      index: block.index,
      blockType: block.blockType,
      kind: kindFor(text),
      yieldScore,
      definitionScore,
      mechanismScore,
      clinicalScore,
      comparisonScore,
      examScore,
      formulaScore,
      fillerPenalty,
      evidenceTerms,
      suppress: false,
    } satisfies ParagraphSignal;
  });
}
