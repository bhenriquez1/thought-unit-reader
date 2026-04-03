import type { SemanticPage, SemanticParagraph } from "@/lib/pdf/buildSemanticPage";
import type {
  DecisionPath,
  EvidenceAnchor,
  InsightPageType,
  OperatorSequence,
  PageInsightModel,
} from "./types";

type ParagraphKind =
  | "definition"
  | "process"
  | "cause_effect"
  | "comparison"
  | "application"
  | "warning"
  | "example"
  | "descriptive";

type ParagraphInsight = {
  id: string;
  paragraphId: string;
  text: string;
  summary: string;
  kind: ParagraphKind;
  priority: number;
  confidence: number;
  signals: string[];
  evidence: EvidenceAnchor[];
};

const MAX_TAKEAWAYS = 6;
const MAX_SEQUENCES = 6;

export function processPage(page: SemanticPage): PageInsightModel {
  const paragraphInsights = page.paragraphs
    .map(buildParagraphInsight)
    .filter((item): item is ParagraphInsight => item !== null)
    .sort((a, b) => b.priority - a.priority);

  const topParagraphs = paragraphInsights.slice(0, MAX_TAKEAWAYS);

  const pageSummary = inferPageSummary(page, topParagraphs);
  const topTakeaways = buildTopTakeaways(topParagraphs);
  const operatorSequences = buildOperatorSequences(topParagraphs, page);
  const decisionPaths = mapSequencesToDecisionPaths(operatorSequences, page.pageNumber);

  return {
    pageType: inferPageType(topParagraphs),
    pageSummary,
    topTakeaways,
    logicChains: [],
    decisionPaths,
    priorityBlocks: [],
    hiddenBlocks: [],
    paragraphInsights: [],
    scannedParagraphCount: page.paragraphs.length,
    operatorSequences,
  };
}

function buildParagraphInsight(paragraph: SemanticParagraph): ParagraphInsight | null {
  const text = paragraph.text.trim();
  if (!text || text.length < 20) return null;

  const sentences = paragraph.sentences.map((s) => s.text.trim()).filter(Boolean);

  if (!sentences.length) return null;

  const kind = classifyParagraph(sentences, text);
  const summary = summarizeParagraph(sentences, kind);
  const signals = extractSignals(sentences, kind);
  const evidence = buildEvidence(paragraph);
  const priority = scoreParagraph(paragraph, kind, text, signals);
  const confidence = scoreConfidence(paragraph, kind, signals);

  return {
    id: `insight-${paragraph.id}`,
    paragraphId: paragraph.id,
    text,
    summary,
    kind,
    priority,
    confidence,
    signals,
    evidence,
  };
}

function classifyParagraph(sentences: string[], fullText: string): ParagraphKind {
  const joined = `${fullText} ${sentences.join(" ")}`.toLowerCase();

  if (/\b(defined as|is called|refers to|means that)\b/.test(joined)) {
    return "definition";
  }

  if (
    /\b(first|second|third|next|then|finally|step|process|procedure|sequence)\b/.test(joined)
  ) {
    return "process";
  }

  if (
    /\b(because|therefore|thus|so that|leads to|results in|causes|caused by|produces)\b/.test(
      joined,
    )
  ) {
    return "cause_effect";
  }

  if (
    /\b(whereas|while|in contrast|compared with|versus|vs\.?|however)\b/.test(joined)
  ) {
    return "comparison";
  }

  if (/\b(for example|for instance|consider|suppose|if we|in practice)\b/.test(joined)) {
    return "example";
  }

  if (
    /\b(should|must|need to|important to|used to|applied to|check|evaluate)\b/.test(joined)
  ) {
    return "application";
  }

  if (
    /\b(avoid|warning|pitfall|do not|should not|error|incorrect|misleading)\b/.test(joined)
  ) {
    return "warning";
  }

  return "descriptive";
}

function summarizeParagraph(sentences: string[], kind: ParagraphKind): string {
  const best = selectBestSentence(sentences, kind);
  return compressSentence(best);
}

function selectBestSentence(sentences: string[], kind: ParagraphKind): string {
  if (sentences.length === 1) return sentences[0];

  const ranked = [...sentences].sort(
    (a, b) => scoreSentenceForKind(b, kind) - scoreSentenceForKind(a, kind),
  );

  return ranked[0];
}

function scoreSentenceForKind(text: string, kind: ParagraphKind): number {
  const lower = text.toLowerCase();
  let score = 0;

  if (text.length >= 35 && text.length <= 220) score += 2;
  if (/[.!?]$/.test(text)) score += 1;

  switch (kind) {
    case "definition":
      if (/\b(is|refers to|means|defined as)\b/.test(lower)) score += 4;
      break;
    case "process":
      if (/\b(first|next|then|finally|step|process|procedure)\b/.test(lower)) score += 4;
      break;
    case "cause_effect":
      if (/\b(because|therefore|results in|leads to|causes)\b/.test(lower)) score += 4;
      break;
    case "comparison":
      if (/\b(whereas|however|in contrast|compared)\b/.test(lower)) score += 4;
      break;
    case "application":
      if (/\b(should|must|used to|applied to|check|evaluate)\b/.test(lower)) score += 4;
      break;
    case "warning":
      if (/\b(avoid|do not|should not|warning|pitfall|incorrect)\b/.test(lower)) score += 4;
      break;
    case "example":
      if (/\b(for example|for instance|consider|suppose)\b/.test(lower)) score += 4;
      break;
    default:
      break;
  }

  return score;
}

function extractSignals(sentences: string[], kind: ParagraphKind): string[] {
  const lowerJoined = sentences.join(" ").toLowerCase();
  const signals: string[] = [];

  if (kind === "cause_effect") {
    if (/\bbecause\b/.test(lowerJoined)) signals.push("because");
    if (/\btherefore\b/.test(lowerJoined)) signals.push("therefore");
    if (/\bresults in\b/.test(lowerJoined)) signals.push("results in");
    if (/\bleads to\b/.test(lowerJoined)) signals.push("leads to");
  }

  if (kind === "comparison") {
    if (/\bwhereas\b/.test(lowerJoined)) signals.push("whereas");
    if (/\bhowever\b/.test(lowerJoined)) signals.push("however");
    if (/\bin contrast\b/.test(lowerJoined)) signals.push("in contrast");
  }

  if (kind === "process") {
    if (/\bfirst\b/.test(lowerJoined)) signals.push("first");
    if (/\bthen\b/.test(lowerJoined)) signals.push("then");
    if (/\bfinally\b/.test(lowerJoined)) signals.push("finally");
  }

  if (kind === "warning") {
    if (/\bavoid\b/.test(lowerJoined)) signals.push("avoid");
    if (/\bdo not\b/.test(lowerJoined)) signals.push("do not");
    if (/\bshould not\b/.test(lowerJoined)) signals.push("should not");
  }

  if (kind === "application") {
    if (/\bshould\b/.test(lowerJoined)) signals.push("should");
    if (/\bmust\b/.test(lowerJoined)) signals.push("must");
    if (/\bused to\b/.test(lowerJoined)) signals.push("used to");
  }

  return signals;
}

function buildEvidence(paragraph: SemanticParagraph): EvidenceAnchor[] {
  return paragraph.sentences.slice(0, 3).map((sentence, index) => ({
    id: sentence.id,
    paragraphIndex: paragraph.startLineIndex,
    sentenceIndex: index,
    text: sentence.text,
    startOffset: sentence.startOffset,
    endOffset: sentence.endOffset,
  }));
}

function scoreParagraph(
  paragraph: SemanticParagraph,
  kind: ParagraphKind,
  text: string,
  signals: string[],
): number {
  let score = 0;

  score += paragraph.confidence * 3;
  score += Math.min(2, paragraph.sentences.length * 0.4);
  score += Math.min(2, signals.length * 0.5);

  if (text.length >= 60 && text.length <= 500) score += 1;

  switch (kind) {
    case "definition":
    case "process":
    case "cause_effect":
    case "comparison":
    case "application":
    case "warning":
      score += 2;
      break;
    case "example":
      score += 1;
      break;
    default:
      score += 0.5;
      break;
  }

  return score;
}

function scoreConfidence(
  paragraph: SemanticParagraph,
  kind: ParagraphKind,
  signals: string[],
): number {
  let score = paragraph.confidence;

  if (signals.length > 0) score += 0.1;
  if (kind !== "descriptive") score += 0.05;
  if (paragraph.sentences.length >= 2) score += 0.05;

  return clamp(score, 0, 1);
}

function inferPageSummary(page: SemanticPage, insights: ParagraphInsight[]): string {
  if (page.headings.length > 0 && insights.length > 0) {
    const heading = cleanLead(page.headings[0].text);
    const main = cleanLead(insights[0].summary);
    return `${heading}: ${main}`;
  }

  if (insights.length > 0) {
    return cleanLead(insights[0].summary);
  }

  if (page.paragraphs.length > 0) {
    return cleanLead(compressSentence(page.paragraphs[0].text));
  }

  return "This page contains extracted content.";
}

function buildTopTakeaways(insights: ParagraphInsight[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const insight of insights) {
    const candidate = cleanLead(insight.summary);
    const key = candidate.toLowerCase();

    if (!candidate || seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);

    if (result.length >= MAX_TAKEAWAYS) break;
  }

  return result;
}

function buildOperatorSequences(
  insights: ParagraphInsight[],
  page: SemanticPage,
): OperatorSequence[] {
  const source = insights.slice(0, MAX_SEQUENCES);

  return source.map((insight, index) => {
    const template = mapKindToTemplate(insight.kind);
    const primaryEvidence = insight.evidence[0]?.text || insight.summary;

    switch (insight.kind) {
      case "process":
        return {
          id: `seq-${page.pageNumber}-${index}`,
          template,
          signal: primaryEvidence,
          mechanism: cleanLead(insight.summary),
          result: buildResultFromSummary(insight.summary),
          prediction: buildPredictionFromSignals(insight.signals, insight.summary),
          confusionPoint: buildConfusionPoint(insight.kind, insight.text),
          confidence: insight.confidence,
          evidence: insight.evidence,
        };

      case "comparison":
        return {
          id: `seq-${page.pageNumber}-${index}`,
          template,
          signal: primaryEvidence,
          separatingSignal: cleanLead(insight.summary),
          decisionRule: buildDecisionRule(insight.summary),
          confusionPoint: buildConfusionPoint(insight.kind, insight.text),
          trap: buildTrap(insight.kind, insight.text),
          confidence: insight.confidence,
          evidence: insight.evidence,
        };

      case "application":
      case "warning":
        return {
          id: `seq-${page.pageNumber}-${index}`,
          template,
          state: primaryEvidence,
          riskSignal: cleanLead(insight.summary),
          impact: buildImpact(insight.summary),
          action: buildAction(insight.summary),
          failureMode: buildTrap(insight.kind, insight.text),
          confidence: insight.confidence,
          evidence: insight.evidence,
        };

      case "cause_effect":
        return {
          id: `seq-${page.pageNumber}-${index}`,
          template,
          signal: primaryEvidence,
          interpretation: cleanLead(insight.summary),
          impact: buildImpact(insight.summary),
          nextMove: buildAction(insight.summary),
          trap: buildTrap(insight.kind, insight.text),
          confidence: insight.confidence,
          evidence: insight.evidence,
        };

      case "definition":
      case "example":
      case "descriptive":
      default:
        return {
          id: `seq-${page.pageNumber}-${index}`,
          template,
          signal: primaryEvidence,
          interpretation: cleanLead(insight.summary),
          impact: buildImpact(insight.summary),
          nextMove: buildAction(insight.summary),
          relation: buildRelation(page, insight),
          confidence: insight.confidence,
          evidence: insight.evidence,
        };
    }
  });
}

function mapKindToTemplate(kind: ParagraphKind): OperatorSequence["template"] {
  switch (kind) {
    case "comparison":
      return "comparison";
    case "cause_effect":
    case "definition":
    case "descriptive":
      return "clinical";
    case "process":
      return "science";
    case "application":
    case "warning":
      return "operator";
    case "example":
    default:
      return "clinical";
  }
}

function mapSequencesToDecisionPaths(
  sequences: OperatorSequence[],
  pageNumber: number,
): DecisionPath[] {
  return sequences.slice(0, 3).map((seq, index) => ({
    id: `dp-${pageNumber}-${index}`,
    template: seq.template,
    condition:
      seq.signal || seq.state || seq.separatingSignal || "key concept on this page",
    interpretation: seq.interpretation || seq.separatingSignal || seq.mechanism || seq.riskSignal || "interpret this signal",
    implication: seq.impact || seq.result || "this has implications for the next step",
    nextMove: seq.nextMove || seq.action || seq.prediction || "apply this rule",
    trap: seq.trap || seq.failureMode || seq.confusionPoint,
    evidence: seq.evidence.map((e) => e.text).filter(Boolean).slice(0, 2),
    confidence: seq.confidence,
    sourceParagraphIds: [seq.id],
  }));
}

function inferPageType(insights: ParagraphInsight[]): InsightPageType {
  if (!insights.length) return "mixed";
  const top = insights[0].kind;
  const kindMap: Partial<Record<ParagraphKind, InsightPageType>> = {
    definition: "definition",
    process: "process",
    cause_effect: "cause_effect",
    comparison: "comparison",
    application: "decision",
    warning: "consequence",
    example: "example",
    descriptive: "concept",
  };
  return kindMap[top] || "mixed";
}

function buildResultFromSummary(summary: string): string {
  return `This leads to: ${cleanLead(summary)}`;
}

function buildPredictionFromSignals(signals: string[], summary: string): string {
  if (signals.includes("then") || signals.includes("finally")) {
    return `Expect the next step to follow the sequence described here.`;
  }
  return `The process continues from this point: ${cleanLead(summary)}`;
}

function buildConfusionPoint(kind: ParagraphKind, text: string): string {
  if (kind === "comparison") {
    return "Do not confuse similar-looking ideas without checking the distinguishing feature.";
  }
  if (kind === "process") {
    return "Do not skip the order of operations implied by the page.";
  }
  return `Potential confusion: ${compressSentence(text).slice(0, 120)}`;
}

function buildDecisionRule(summary: string): string {
  return `Use this distinction rule: ${cleanLead(summary)}`;
}

function buildTrap(kind: ParagraphKind, text: string): string {
  if (kind === "warning") {
    return cleanLead(compressSentence(text));
  }
  return "Avoid jumping to a conclusion before checking the evidence on the page.";
}

function buildImpact(summary: string): string {
  return `What this changes: ${cleanLead(summary)}`;
}

function buildAction(summary: string): string {
  return `Use this as the next move: ${cleanLead(summary)}`;
}

function buildRelation(page: SemanticPage, insight: ParagraphInsight): string {
  const heading = page.headings[0]?.text;
  if (heading) {
    return `This fits under ${cleanLead(heading)}.`;
  }
  return `This connects to the broader page idea: ${cleanLead(insight.summary)}`;
}

function compressSentence(text: string): string {
  const cleaned = cleanLead(text);
  if (cleaned.length <= 180) return ensureTerminal(cleaned);
  return ensureTerminal(cleaned.slice(0, 177).trimEnd() + "...");
}

function cleanLead(text: string): string {
  return ensureTerminal(
    text
      .replace(/\s+/g, " ")
      .replace(/^This page indicates:\s*/i, "")
      .replace(/^This page reads:\s*/i, "")
      .replace(/^Notice-first read:\s*/i, "")
      .replace(/^Mechanism read:\s*/i, "")
      .replace(/^Discrimination read:\s*/i, "")
      .replace(/^Apply\/Test scenario:\s*/i, "")
      .trim(),
  );
}

function ensureTerminal(text: string): string {
  if (!text) return "";
  if (/[.!?…]$/.test(text)) return text;
  return `${text}.`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
