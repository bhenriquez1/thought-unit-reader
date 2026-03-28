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
const trapWords = /(except|least likely|most likely|confus|pitfall|trap|versus|not\b|unless|associate(?:d)? with)/i;
const distinctionWords = /(vs\.?|versus|acute|chronic|benign|malignant|direct|indirect|superficial|deep)/i;
const decisionWords = /(diagnosis|next step|management|indication|contraindication|treatment choice)/i;
const headingCueWords = /(introduction|overview|summary|framework|principle|key point)/i;
const figureNoise = /(figure|fig\.|plate|image|legend|arrow|label|axis|scale bar)/i;
const watermarkNoise = /(copyright|all rights reserved|www\.|http|printed in|edition|isbn|doi)/i;
const lowSemanticNoise = /^([A-Za-z]?\d+[\s,.;:()\-]*){4,}$/;
const repeatedNumberingNoise = /^(\d+[.)\-]?\s*){3,}[A-Za-z]?/;

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
    const trapScore = trapWords.test(text) ? 1 : 0;
    const distinctionScore = distinctionWords.test(text) ? 1 : 0;
    const clinicalDecisionScore = decisionWords.test(text) ? 1 : 0;
    const semanticDensity = (text.match(/[A-Za-z]{3,}/g) || []).length;
    const isFigureNoise = block.blockType === "caption" && figureNoise.test(text);
    const isWatermarkNoise = watermarkNoise.test(text) || block.blockType === "metadata" || block.blockType === "reference";
    const isNumericNoise = lowSemanticNoise.test(text) || repeatedNumberingNoise.test(text) || semanticDensity < 4;
    const overviewBoost = block.blockType === "heading" || headingCueWords.test(text) ? 0.6 : 0;
    const fillerPenalty =
      (fillerWords.test(text) ? 1 : 0) +
      (isFigureNoise ? 1.2 : 0) +
      (isWatermarkNoise ? 1.4 : 0) +
      (isNumericNoise ? 1.1 : 0);

    const yieldScore =
      definitionScore * 1.5 +
      mechanismScore * 1.7 +
      clinicalScore * 1.6 +
      comparisonScore * 1.4 +
      examScore * 1.2 +
      formulaScore * 1.1 +
      overviewBoost -
      fillerPenalty * 1.7;
    const examSignalScore =
      trapScore * 1.6 +
      distinctionScore * 1.5 +
      mechanismScore * 1.4 +
      definitionScore * 1.2 +
      clinicalDecisionScore * 1.5 -
      fillerPenalty * 1.6;

    const evidenceTerms = [
      ...(definitionWords.test(text) ? ["definition"] : []),
      ...(mechanismWords.test(text) ? ["mechanism"] : []),
      ...(clinicalWords.test(text) ? ["clinical"] : []),
      ...(comparisonWords.test(text) ? ["compare"] : []),
      ...(formulaWords.test(text) ? ["formula"] : []),
      ...(applicationWords.test(text) ? ["exam"] : []),
      ...(trapWords.test(text) ? ["trap"] : []),
      ...(distinctionWords.test(text) ? ["distinction"] : []),
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
      trapScore,
      distinctionScore,
      clinicalDecisionScore,
      examSignalScore,
      fillerPenalty,
      evidenceTerms,
      suppress: false,
    } satisfies ParagraphSignal;
  });
}
