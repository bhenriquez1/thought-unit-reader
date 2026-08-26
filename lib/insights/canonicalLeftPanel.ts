import type { ParagraphKind } from "@/lib/readerContracts";
import type { CurrentPageStudyModel, VisualAnchor } from "@/lib/insights/currentPageStudyModel";
import { getKindLabel } from "@/lib/insights/domainPresets";

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
  /** Shared canonical expert metadata — populated when anchor comes from a VisualAnchor. */
  thesisRelevance?: number;
  misconceptionRisk?: number;
  proceduralImportance?: number;
  connectionStrength?: number;
  speechPriority?: number;
}

/** Returns the display label for a thought unit's kind, using the active domain preset's vocabulary. */
export function importanceLabelForTier(priorityTier: number, category?: string, presetId = "universal"): string {
  if (category) return getKindLabel(presetId, category as ParagraphKind);
  if (priorityTier >= 5) return getKindLabel(presetId, "thesis");
  if (priorityTier >= 4) return getKindLabel(presetId, "keyDetail");
  return getKindLabel(presetId, "filler");
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

function unitFromVisualAnchor(anchor: VisualAnchor, page: number, pageText: string, presetId: string): ExpertAnchor {
  const priorityTier = anchor.priorityTier ?? (anchor.kind === "thesis" || anchor.kind === "definition" ? 5 : anchor.kind === "trap" || anchor.kind === "clinical" || anchor.kind === "mechanism" ? 4 : 3);
  const label = importanceLabelForTier(priorityTier, anchor.kind, presetId);
  return {
    id: anchor.id,
    page,
    title: titleFromText(anchor.exactText, label),
    exactText: anchor.exactText,
    reason: anchor.reason || label,
    category: anchor.kind,
    priorityTier,
    importanceLabel: label,
    lineRange: lineRangeForText(pageText, anchor.exactText),
    source: "canonical_left_panel",
    evidenceRefId: anchor.id,
    spanStart: anchor.spanStart,
    spanEnd: anchor.spanEnd,
    domainCategory: anchor.domainCategory,
    thesisRelevance:      anchor.thesisRelevance,
    misconceptionRisk:    anchor.misconceptionRisk,
    proceduralImportance: anchor.proceduralImportance,
    connectionStrength:   anchor.connectionStrength,
    speechPriority:       anchor.speechPriority,
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

function extractPageTextFallbackUnits(pageText: string, bookId: string, page: number, presetId: string): ExpertAnchor[] {
  const chunks = pageText
    .replace(/\s*\|\s*/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 45 && s.length <= 420);

  return chunks
    .map((text, index) => ({ text, index, score: scoreText(text), category: classifyText(text) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .slice(0, 12)
    .sort((a, b) => a.index - b.index)
    .map((x, i) => {
      const priorityTier = Math.max(3, Math.min(5, x.score));
      // bookId-qualified for the same reason VisualAnchor.id is — see that
      // construction site's comment (Thought Unit Engine identity audit's
      // RC2 finding: a positional-only id can collide across two different
      // documents at the same page number). Empty bookId (a caller that
      // doesn't have one) degrades to the old unqualified shape, not an error.
      const id = bookId ? `clp-${bookId}-p${page}-text-${i + 1}` : `clp-p${page}-text-${i + 1}`;
      const label = importanceLabelForTier(priorityTier, x.category, presetId);
      return {
        id,
        page,
        title: titleFromText(x.text, label),
        exactText: x.text,
        reason: "Selected from the page text by local expert-ranking signals.",
        category: x.category,
        priorityTier,
        importanceLabel: label,
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
  presetId?: string;
  /** Threaded into the page-text fallback path's ids only — the
   *  studyModel/VisualAnchor path already carries a document-qualified id
   *  from where VisualAnchor.id itself is built. */
  bookId?: string;
}): { units: ExpertAnchor[]; diagnosticReason: string | null; fallbackUsed: boolean } {
  const { page, pageText, studyModel, presetId = "universal", bookId = "" } = args;
  const visualAnchors = studyModel?.visualAnchors ?? [];
  if (visualAnchors.length > 0) {
    return {
      units: visualAnchors.map((anchor) => unitFromVisualAnchor(anchor, page, pageText, presetId)),
      diagnosticReason: null,
      fallbackUsed: false,
    };
  }

  if (!pageText.trim()) {
    return { units: [], diagnosticReason: "no extractable text", fallbackUsed: true };
  }

  const fallbackUnits = extractPageTextFallbackUnits(pageText, bookId, page, presetId);
  return {
    units: fallbackUnits,
    diagnosticReason: fallbackUnits.length ? "model returned no anchors; using local page-text expert ranking" : "canonical unit build failed",
    fallbackUsed: true,
  };
}
