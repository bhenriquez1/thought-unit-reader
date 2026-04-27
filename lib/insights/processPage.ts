import type {
  DatApexInsight,
  DecisionPath,
  ExtractedSignals,
  InsightPageType,
  LogicChain,
  PageInsightModel,
  ParagraphInsight,
  ParagraphType,
  PriorityBlock,
} from "@/lib/insights/types";
import { cleanSentence } from "@/lib/insights/sentenceCleanup";
import { buildPageStory } from "@/lib/insights/buildPageStory";
import { classifyPageContent } from "@/lib/pdf/classifyPageContent";

function isBoilerplateLine(text: string): boolean {
  return /all rights reserved|copyright|published by|isbn|edition|permissions|contributors?|acknowledg(e)?ments?|www\.|doi\b/i.test(text);
}

const TYPE_PATTERNS: Array<{ type: InsightPageType; patterns: RegExp[] }> = [
  { type: "cause_effect", patterns: [/\b(because|therefore|thus|hence|results? in|leads? to|causes?|consequently)\b/i] },
  { type: "process", patterns: [/\b(first|second|third|next|then|finally|step|sequence|process)\b/i] },
  { type: "decision", patterns: [/\b(if|when|should|must|choose|decide|determine|indicates?|suggests?)\b/i] },
  { type: "comparison", patterns: [/\b(compared with|in contrast|whereas|unlike|similar|difference|distinguish)\b/i] },
  { type: "definition", patterns: [/\b(is defined as|refers to|means|is called|is the \w+ of|is an? \w+ (that|which))\b/i] },
  { type: "clinical_reasoning", patterns: [/\b(patient|symptom|diagnosis|clinical|finding|history|examination|treatment)\b/i] },
  { type: "formula", patterns: [/\b(equation|formula|calculate|solve|ratio|probability|molar|concentration|derivative|integral|differenti|calculus|theorem|gradient)\b/i, /lim\b.*[(\[]|[=∫∂∑]/] },
  { type: "example", patterns: [/\b(for example|for instance|such as|consider)\b/i] },
  { type: "consequence", patterns: [/\b(as a result|therefore|consequence|outcome|impact)\b/i] },
  { type: "signal", patterns: [/\b(sign|signal|indicator|marker|suggests|indicates)\b/i] },
  { type: "narrative", patterns: [/\b(story|historical|origin|timeline|milestone)\b/i] },
  { type: "concept", patterns: [/\b(concept|principle|framework|overview)\b/i] },
];

function splitIntoParagraphs(pageText: string): string[] {
  const byBlankLine = pageText
    .split(/\n\s*\n/g)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 40 && !isBoilerplateLine(p));
  if (byBlankLine.length >= 2) return byBlankLine;
  return pageText
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 40 && !isBoilerplateLine(p));
}

function normalizeParagraph(text: string): string {
  return cleanSentence(
    text
      .replace(/[“”]/g, "\"")
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function classifyParagraphType(text: string): ParagraphType {
  if (text.length < 50) {
    // Short math/formula lines (e.g. "dV/dt = 4πr² · dr/dt") are still classifiable.
    // Only preserve them if they contain an unambiguous math signal; all other short
    // text stays "noise" so non-math noise filtering is unchanged.
    if (/[=∫∑∂π√∞±→]|dy\/dx|d[xyz]\/d[txyz]|d\/d[txyz]|\blim\b|\bf\(x\)\b/i.test(text)) return "formula";
    return "noise";
  }
  const scored = TYPE_PATTERNS.map(({ type, patterns }) => ({
    type,
    score: patterns.reduce((acc, regex) => acc + (regex.test(text) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top || top.score === 0) return "mixed";
  return top.type;
}

function extractClauses(text: string, starterRegex: RegExp): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.filter((s) => starterRegex.test(s)).slice(0, 3);
}

function extractSignals(text: string): ExtractedSignals {
  const actions = text.match(/\b(should|must|need to|needs to|required to|ask|assess|clarify|evaluate|distinguish|record)\b[^.]{0,120}/gi) || [];
  const contrasts = text.match(/\b(unlike|whereas|in contrast|however|but|rather than)\b[^.]{0,120}/gi) || [];
  const examples = text.match(/\b(for example|for instance|such as)\b[^.]{0,120}/gi) || [];
  return {
    triggers: extractClauses(text, /\b(if|when|whenever)\b/i),
    actions: actions.slice(0, 5).map((m) => m.trim()),
    // Expand reasons to include science/math relational language — captures "X determines Y", "X represents Y"
    reasons: extractClauses(text, /\b(because|since|as|due to|determines?|represents?|identifies?|governs?)\b/i),
    // Expand outcomes to include definitional relationships — captures "X consists of Y", "X equals Y"
    outcomes: extractClauses(text, /\b(therefore|thus|so|results? in|leads? to|causes?|equals?|consists? of)\b/i),
    contrasts: contrasts.slice(0, 4).map((m) => m.trim()),
    examples: examples.slice(0, 4).map((m) => m.trim()),
  };
}

function dedupe<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildLogicChains(text: string, paragraphId: string): LogicChain[] {
  const chains: LogicChain[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (/\b(if|when)\b/.test(lower)) {
      const ifMatch = sentence.match(/\b(?:if|when)\s+(.+?)(?:,|\bthen\b)/i);
      const thenMatch = sentence.match(/\bthen\b\s+(.+?)(?:[.!?]|$)/i);
      chains.push({
        id: `${paragraphId}-chain-${chains.length}`,
        if: (ifMatch?.[1] || sentence).trim(),
        then: (thenMatch?.[1] || sentence).trim(),
        because: sentence,
        next: undefined,
        confidence: 0.78,
        sourceParagraphIds: [paragraphId],
      });
    } else if (/\b(suggests?|indicates?|leads? to|results? in|causes?|determines?|represents?|equals?|consists? of)\b/.test(lower)) {
      const [left, right] = sentence.split(/\b(suggests?|indicates?|leads? to|results? in|causes?|determines?|represents?|equals?|consists? of)\b/i);
      chains.push({
        id: `${paragraphId}-chain-${chains.length}`,
        if: (left || sentence).trim(),
        then: (right || sentence).trim(),
        because: sentence,
        confidence: 0.72,
        sourceParagraphIds: [paragraphId],
      });
    }
  }
  return dedupe(chains, (chain) => `${chain.if}::${chain.then}`).slice(0, 2);
}

function summarizeParagraph(text: string, type: ParagraphType): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const firstSentence = sentences[0] || text;
  if (type === "cause_effect") {
    const causal = sentences.find((entry) => /\b(leads? to|results? in|causes?|therefore|thus|because)\b/i.test(entry));
    const line = causal || firstSentence;
    return line.length > 140 ? `${line.slice(0, 137)}...` : line;
  }
  if (type === "comparison") {
    const contrast = sentences.find((entry) => /\b(unlike|whereas|in contrast|rather than|distinguish)\b/i.test(entry));
    const line = contrast || firstSentence;
    return line.length > 140 ? `${line.slice(0, 137)}...` : line;
  }
  if (type === "process") {
    const procedural = sentences.find((entry) => /\b(first|then|next|finally|step)\b/i.test(entry));
    const line = procedural || firstSentence;
    return line.length > 140 ? `${line.slice(0, 137)}...` : line;
  }
  if (type === "consequence" || type === "signal") {
    const signalLine = sentences.find((entry) => /\b(indicates?|suggests?|result|impact|outcome|signal|marker)\b/i.test(entry));
    const line = signalLine || firstSentence;
    return line.length > 140 ? `${line.slice(0, 137)}...` : line;
  }
  return firstSentence.length > 150 ? `${firstSentence.slice(0, 147)}...` : firstSentence;
}

function scoreParagraphPriority(type: ParagraphType, signals: ExtractedSignals, text: string): number {
  let score = 0;
  if (type === "decision" || type === "clinical_reasoning") score += 3;
  if (type === "cause_effect" || type === "comparison") score += 3;
  if (type === "process") score += 2;
  if (type === "consequence" || type === "signal") score += 2;
  if (type === "definition") score += 2;
  // Formula and concept paragraphs carry structural teaching content — rank them
  if (type === "formula") score += 2;
  if (type === "concept") score += 1;
  if (signals.triggers.length > 0) score += 2;
  if (signals.actions.length > 0) score += 2;
  if (signals.reasons.length > 0) score += 1;
  if (signals.outcomes.length > 0) score += 1;
  if (signals.contrasts.length > 0) score += 1;
  if (/copyright|all rights reserved|www\.|doi/i.test(text)) score -= 3;
  if (type === "noise") score -= 3;
  return score;
}

function processParagraph(text: string, paragraphIndex: number): ParagraphInsight {
  const cleanedText = normalizeParagraph(text);
  const id = `p-${paragraphIndex}`;
  const paragraphType = classifyParagraphType(cleanedText);
  const signals = extractSignals(cleanedText);
  const logicChains = buildLogicChains(cleanedText, id);
  const summary = summarizeParagraph(cleanedText, paragraphType);
  const priorityScore = scoreParagraphPriority(paragraphType, signals, cleanedText);
  const takeawayPool = dedupe([
    summary,
    ...signals.actions,
    ...signals.reasons,
    ...signals.outcomes,
  ], (x) => x.toLowerCase()).filter((line) => line.length > 12);

  return {
    id,
    paragraphIndex,
    rawText: text,
    cleanedText,
    paragraphType,
    summary,
    coreSignals: [...signals.triggers, ...signals.actions, ...signals.outcomes].slice(0, 4),
    logicChains,
    takeaways: takeawayPool.slice(0, 3),
    traps: signals.contrasts.slice(0, 2),
    applications: signals.actions.slice(0, 2),
    priorityScore,
    confidence: Math.max(0.2, Math.min(0.95, 0.35 + priorityScore * 0.08 + logicChains.length * 0.1)),
  };
}

function inferPagePurpose(sorted: ParagraphInsight[]): string {
  if (!sorted.length) return "";

  const STRONG_TYPES = new Set([
    "definition", "cause_effect", "decision", "clinical_reasoning", "consequence", "signal",
  ]);

  // Prefer a high-priority paragraph with a strong semantic type
  const strongParagraph = sorted.find(
    (p) => STRONG_TYPES.has(p.paragraphType) && p.summary.length >= 30 && p.priorityScore >= 2
  );

  const primary = strongParagraph ?? sorted[0];
  if (!primary) return "";

  // Use summary if substantial; otherwise fall through to takeaways / coreSignals
  let base = primary.summary;
  if (base.length < 30) {
    base =
      primary.takeaways.find((t) => t.length >= 30) ??
      primary.coreSignals.find((s) => s.length >= 30) ??
      base;
  }
  if (!base || base.length < 15) return "";

  // Supplement with one distinct takeaway from a different high-priority paragraph
  const secondary = sorted.find(
    (p) =>
      p !== primary &&
      p.priorityScore >= 2 &&
      (p.takeaways[0]?.length ?? 0) >= 20 &&
      p.takeaways[0]?.toLowerCase().slice(0, 35) !== base.toLowerCase().slice(0, 35)
  );
  const supplement = secondary?.takeaways[0] ?? "";
  const blended = supplement ? `${base} ${supplement}`.trim() : base;
  return blended.length > 170 ? `${blended.slice(0, 167)}...` : blended;
}

function inferPageType(sorted: ParagraphInsight[]): InsightPageType {
  const top = sorted[0]?.paragraphType;
  if (!top || top === "noise") return "mixed";
  if (top === "mixed") return "mixed";
  return top;
}

function buildDatApexInsight(paragraphs: ParagraphInsight[]): DatApexInsight | undefined {
  const top = paragraphs.filter((entry) => entry.priorityScore >= 4).sort((a, b) => b.priorityScore - a.priorityScore)[0];
  if (!top) return undefined;
  const chain = top.logicChains[0];
  return {
    testedConcept: top.summary,
    quickRule: chain ? `${chain.if} -> ${chain.then}` : top.takeaways[0] || "Focus on the highest-priority rule.",
    trapWarnings: top.traps?.slice(0, 2) || [],
    likelyQuestionStem: `Which choice best follows this page logic about ${top.paragraphType.replace(/_/g, " ")}?`,
    answerLogic: chain
      ? [`Recognize: ${chain.if}`, `Interpret: ${chain.then}`, `Reason: ${chain.because}`]
      : top.takeaways.slice(0, 3),
  };
}

function toPriorityBlocks(sorted: ParagraphInsight[]): PriorityBlock[] {
  const top = sorted.slice(0, 3);
  const logicChains = dedupe(top.flatMap((entry) => entry.logicChains), (chain) => `${chain.if}|${chain.then}`).slice(0, 3);
  const takeaways = dedupe(top.flatMap((entry) => entry.takeaways), (line) => line.toLowerCase()).slice(0, 3);
  return [
    { id: "overview", kind: "overview", title: "Page Summary", content: [top[0]?.summary || "Limited evidence on this page."], priority: 10, collapsedByDefault: false },
    { id: "logic", kind: "logic_chain", title: "Logic Chains", content: logicChains, priority: 9, collapsedByDefault: false },
    { id: "takeaways", kind: "takeaway", title: "Top Takeaways", content: takeaways, priority: 8, collapsedByDefault: false },
    { id: "contrast", kind: "contrast", title: "Contrast / Traps", content: dedupe(top.flatMap((entry) => entry.traps || []), (line) => line.toLowerCase()).slice(0, 3), priority: 6, collapsedByDefault: true },
    { id: "connection", kind: "connection", title: "Connections", content: dedupe(top.flatMap((entry) => entry.coreSignals), (line) => line.toLowerCase()).slice(0, 3), priority: 6, collapsedByDefault: true },
    { id: "application", kind: "application", title: "Apply / Test", content: dedupe(top.flatMap((entry) => entry.applications || []), (line) => line.toLowerCase()).slice(0, 3), priority: 7, collapsedByDefault: true },
  ];
}

function toDecisionPaths(sorted: ParagraphInsight[]): DecisionPath[] {
  return sorted
    .slice(0, 6)
    .map((entry, index) => {
      const template: DecisionPath["template"] =
        entry.paragraphType === "clinical_reasoning"
          ? "clinical"
          : entry.paragraphType === "comparison"
            ? "comparison"
            : entry.paragraphType === "cause_effect" || entry.paragraphType === "process" || entry.paragraphType === "formula"
              ? "science"
              : "operator";
      const chain = entry.logicChains[0];
      if (chain) {
        return {
          id: `dp-${entry.id}-${index}`,
          template,
          condition: chain.if,
          interpretation: entry.summary,
          implication: chain.then,
          nextMove: chain.next || entry.applications?.[0] || "Apply this rule to a concrete scenario.",
          trap: chain.trap || entry.traps?.[0],
          evidence: [entry.cleanedText, chain.because].filter(Boolean).slice(0, 2),
          confidence: chain.confidence,
          sourceParagraphIds: chain.sourceParagraphIds,
        } satisfies DecisionPath;
      }
      return {
        id: `dp-${entry.id}-${index}`,
        template,
        condition: entry.coreSignals[0] || entry.summary,
        interpretation: entry.summary,
        implication: entry.takeaways[0] || "Key implication is grounded in this paragraph.",
        nextMove: entry.applications?.[0] || "Check this rule against an example.",
        trap: entry.traps?.[0],
        evidence: [entry.cleanedText].filter(Boolean),
        confidence: entry.confidence,
        sourceParagraphIds: [entry.id],
      } satisfies DecisionPath;
    })
    .filter((path) => Boolean(path.condition && path.implication))
    .slice(0, 3);
}

export function processPage(pageText: string, enableDatApex = false): PageInsightModel {
  const paragraphs = splitIntoParagraphs(pageText);
  const paragraphInsights = paragraphs.map((paragraph, index) => processParagraph(paragraph, index));
  const sorted = [...paragraphInsights].sort((a, b) => b.priorityScore - a.priorityScore);
  const blocks = toPriorityBlocks(sorted);
  const visible = blocks.filter((block) => !block.collapsedByDefault);
  const hidden = blocks.filter((block) => block.collapsedByDefault);
  const pageSummary = inferPagePurpose(sorted);
  const logicChains = (visible.find((block) => block.kind === "logic_chain")?.content as LogicChain[] | undefined) || [];
  const topTakeaways = (visible.find((block) => block.kind === "takeaway")?.content as string[] | undefined) || [];
  const decisionPaths = toDecisionPaths(sorted);
  const pageClass = classifyPageContent(pageText || "");
  const pageStory = buildPageStory({
    pageClass,
    pageModel: {
      pageSummary,
      topTakeaways,
      paragraphInsights: paragraphInsights.map((entry) => ({
        summary: entry.summary,
        text: entry.cleanedText,
        signal: entry.coreSignals[0],
        application: entry.applications?.[0],
        trap: entry.traps?.[0],
        score: entry.confidence,
        priority: entry.priorityScore / 10,
        evidence: entry.cleanedText,
        paragraphType: entry.paragraphType,
      })),
      decisionPaths: decisionPaths.map((entry) => ({
        condition: entry.condition,
        interpretation: entry.interpretation,
        implication: entry.implication,
        nextMove: entry.nextMove,
        trap: entry.trap,
        evidenceSnippet: entry.evidence[0],
      })),
    },
    mode: "insight",
  });

  return {
    pageType: inferPageType(sorted),
    pageSummary,
    topTakeaways,
    logicChains,
    decisionPaths,
    priorityBlocks: visible,
    hiddenBlocks: hidden,
    paragraphInsights,
    scannedParagraphCount: paragraphInsights.length,
    pageStory,
    datApex: enableDatApex ? buildDatApexInsight(sorted) : undefined,
  };
}
