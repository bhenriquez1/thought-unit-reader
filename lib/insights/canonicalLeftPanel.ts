import type { ParagraphKind } from "@/lib/readerContracts";
import type { CurrentPageStudyModel, VisualAnchor } from "@/lib/insights/currentPageStudyModel";

export type CanonicalLeftPanelSource =
  | "canonical_left_panel"
  | "page_text_fallback"
  | "model_fallback";

export interface ExpertAnchor {
  id: string;
  page: number;
  title: string;
  exactText: string;
  reason: string;
  category: ParagraphKind;
  priorityTier: number;
  importanceLabel: string;
  lineRange?: string;
  source: CanonicalLeftPanelSource;
  evidenceRefId: string;
  spanStart?: string;
  spanEnd?: string;
  domainCategory?: string;
  grounded?: boolean;
}

const CATEGORY_LABEL: Record<string, string> = {
  thesis: "Master This",
  definition: "Master This",
  mechanism: "Procedure Step",
  application: "Procedure Step",
  formula: "Procedure Step",
  comparison: "Decision Point",
  trap: "Danger Zone",
  clinical: "Clinical Pearl",
  dat_fact: "Key Detail",
  keyDetail: "Key Detail",
  keyAnatomy: "Key Detail",
  memoryAnchor: "Memory Anchor",
  reference: "Supporting Detail",
  filler: "Supporting Detail",
  unknown: "Supporting Detail",
};

export function importanceLabelForTier(priorityTier: number, category?: string): string {
  if (category && CATEGORY_LABEL[category]) return CATEGORY_LABEL[category];
  if (priorityTier >= 5) return "Master This";
  if (priorityTier >= 4) return "Key Detail";
  if (priorityTier >= 3) return "Supporting Detail";
  return "Supporting Detail";
}

function titleFromText(text: string, fallback: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return fallback;
  const words = cleaned.split(" ").slice(0, 7).join(" ");
  return words.length < cleaned.length ? `${words}…` : words;
}

function lineRangeForText(pageText: string, text: string): string | undefined {
  if (!pageText || !text) return undefined;
  const offset = pageText.toLowerCase().indexOf(text.toLowerCase().slice(0, 80));
  if (offset < 0) return undefined;
  const charsPerLine = 90;
  const start = Math.floor(offset / charsPerLine) + 1;
  const end = Math.floor((offset + text.length) / charsPerLine) + 1;
  return start === end ? `${start}` : `${start}–${end}`;
}

function unitFromVisualAnchor(anchor: VisualAnchor, page: number, pageText: string): ExpertAnchor {
  const priorityTier = anchor.priorityTier ?? (anchor.kind === "thesis" || anchor.kind === "definition" ? 5 : anchor.kind === "trap" || anchor.kind === "clinical" || anchor.kind === "mechanism" ? 4 : 3);
  return {
    id: anchor.id,
    page,
    title: titleFromText(anchor.exactText, importanceLabelForTier(priorityTier, anchor.kind)),
    exactText: anchor.exactText,
    reason: anchor.reason || importanceLabelForTier(priorityTier, anchor.kind),
    category: anchor.kind,
    priorityTier,
    importanceLabel: importanceLabelForTier(priorityTier, anchor.kind),
    lineRange: lineRangeForText(pageText, anchor.exactText),
    source: "canonical_left_panel",
    evidenceRefId: anchor.id,
    spanStart: anchor.spanStart,
    spanEnd: anchor.spanEnd,
    domainCategory: anchor.domainCategory,
  };
}

function classifyText(text: string): ParagraphKind {
  const lower = text.toLowerCase();
  if (/danger|risk|mistake|trap|avoid|except|complication|pitfall/.test(lower)) return "trap";
  if (/because|therefore|leads to|results in|mechanism|process|step|pathway/.test(lower)) return "mechanism";
  if (/define|means|is called|refers to|consists of/.test(lower)) return "definition";
  if (/clinical|patient|case|diagnos|symptom|treatment/.test(lower)) return "clinical";
  if (/remember|mnemonic|high[- ]?yield|important|key/.test(lower)) return "dat_fact";
  return "keyDetail";
}

function scoreText(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  if (/because|therefore|leads to|results in|mechanism|process|step|pathway/.test(lower)) score += 3;
  if (/danger|risk|mistake|trap|avoid|except|complication|pitfall/.test(lower)) score += 3;
  if (/clinical|patient|case|diagnos|symptom|treatment/.test(lower)) score += 2;
  if (/define|means|is called|refers to|consists of/.test(lower)) score += 2;
  if (/\b[A-Z][A-Za-z0-9-]{3,}\b/.test(text)) score += 1;
  if (text.length > 80 && text.length < 420) score += 1;
  return score;
}

function extractPageTextFallbackUnits(pageText: string, page: number): ExpertAnchor[] {
  const chunks = pageText
    .replace(/\s*\|\s*/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 45 && s.length <= 420);

  return chunks
    .map((text, index) => ({ text, index, score: scoreText(text), category: classifyText(text) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .slice(0, 6)
    .sort((a, b) => a.index - b.index)
    .map((x, i) => {
      const priorityTier = Math.max(3, Math.min(5, x.score));
      const id = `clp-p${page}-text-${i + 1}`;
      return {
        id,
        page,
        title: titleFromText(x.text, importanceLabelForTier(priorityTier, x.category)),
        exactText: x.text,
        reason: "Selected from the page text by local expert-ranking signals.",
        category: x.category,
        priorityTier,
        importanceLabel: importanceLabelForTier(priorityTier, x.category),
        lineRange: lineRangeForText(pageText, x.text),
        source: "page_text_fallback",
        evidenceRefId: id,
      };
    });
}

export function buildCanonicalLeftPanelUnits(args: {
  page: number;
  pageText: string;
  studyModel?: CurrentPageStudyModel | null;
}): { units: ExpertAnchor[]; diagnosticReason: string | null; fallbackUsed: boolean } {
  const { page, pageText, studyModel } = args;
  const visualAnchors = studyModel?.visualAnchors ?? [];
  if (visualAnchors.length > 0) {
    return {
      units: visualAnchors.map((anchor) => unitFromVisualAnchor(anchor, page, pageText)),
      diagnosticReason: null,
      fallbackUsed: false,
    };
  }

  if (!pageText.trim()) {
    return { units: [], diagnosticReason: "no extractable text", fallbackUsed: true };
  }

  const fallbackUnits = extractPageTextFallbackUnits(pageText, page);
  return {
    units: fallbackUnits,
    diagnosticReason: fallbackUnits.length ? "model returned no anchors; using local page-text expert ranking" : "canonical unit build failed",
    fallbackUsed: true,
  };
}
