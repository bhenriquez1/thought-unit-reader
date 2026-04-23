import fs from "fs";
import path from "path";

import { processPage } from "@/lib/insights/processPage";
import { classifyPageContent } from "@/lib/pdf/classifyPageContent";
import { normalizeClinicalText } from "@/lib/normalization/normalizeClinicalText";
import { detectPageDomain } from "@/lib/insights/detectPageDomain";
import { findMainTeachingZone } from "@/lib/insights/findMainTeachingZone";
import { adaptPageInsightModel, buildUltraPageView, isValidCoreParagraph } from "@/lib/insights/buildUltraPageView";
import { extractConceptBlocks } from "@/lib/insights/extractConceptBlocks";
import { scoreDomainPriority } from "@/lib/insights/scoreDomainPriority";
import { buildPageStepModel } from "@/lib/reading-graph/buildPageStepModel";
import { selectMiniTestQuestions } from "@/lib/insights/selectMiniTestQuestions";
import { buildCompressionRules } from "@/lib/insights/buildCompressionRules";
import { buildHighlightNeighborhoods } from "@/lib/highlights/buildHighlightNeighborhoods";

type AnalysisCase = { id: string; pageNumber: number; text: string };

const BIOLOGY_CASE: AnalysisCase = {
  id: "biology_failure_case",
  pageNumber: 14,
  text: `Chapter 3: Cellular Energetics Overview

The electron transport chain is a sequence of redox reactions in the inner mitochondrial membrane. Electrons from NADH and FADH2 flow through complexes I to IV, and this transfer drives proton pumping from the matrix to the intermembrane space. ATP synthase uses the proton gradient to produce ATP from ADP and inorganic phosphate.

Students often memorize glycolysis, the Krebs cycle, and oxidative phosphorylation as disconnected lists. However, the conceptual layer that matters is coupling: redox energy is converted to an electrochemical gradient and then converted again to chemical bond energy in ATP. If oxygen is absent, electron transport stalls, NADH accumulates, and ATP yield collapses.

A common trap is confusing where ATP is generated and where reducing equivalents are produced. Glycolysis generates ATP and NADH in the cytosol; the Krebs cycle generates most NADH in the matrix; oxidative phosphorylation generates most ATP at the inner membrane. Do not confuse substrate-level phosphorylation with oxidative phosphorylation.

For example, rotenone blocks complex I and cyanide blocks complex IV, but both reduce oxidative ATP production because electron flow cannot reach oxygen as the terminal acceptor.`
};

const CALCULUS_CASE: AnalysisCase = {
  id: "calculus_failure_case",
  pageNumber: 27,
  text: `Section 5.4 Chain Rule and Related Rates

If y = f(g(x)), then dy/dx = f'(g(x)) · g'(x). This identity states that the derivative of a composite function is the derivative of the outer function evaluated at the inner function times the derivative of the inner function.

In related rates, differentiate both sides with respect to time and keep track of which variables depend on t. For a sphere with V = (4/3)πr^3, dV/dt = 4πr^2 · dr/dt. The formula sentence is often copied, but students miss the conceptual anchor: every symbol must be tied to the same instant in time.

However, many solutions fail because they plug in radius values before differentiating, which destroys variable dependence and loses dr/dt. Another trap is mixing partial snapshots from two moments of motion.

Example: When r = 3 cm and dr/dt = 2 cm/s, then dV/dt = 72π cm^3/s. This numerical step should be last, not first.`
};

function headingLinesFromText(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length < 90 && !/[.!?]$/.test(line))
    .slice(0, 6);
}

function extractFormulaSignals(rawText: string): string[] {
  const lines = rawText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const eqPattern = /([A-Za-z0-9)\]]\s*=\s*[A-Za-z0-9([\-+*/^]|[0-9A-Za-z].*[=<>≤≥])/;
  const symbolicPattern = /\b(let|define|denote|where|given by|represented by)\b/i;
  return lines.filter((line) => eqPattern.test(line) || (symbolicPattern.test(line) && /[A-Za-z]\([A-Za-z]\)|[xyznrt]=|f\(x\)|[=]/.test(line)));
}

function analyzeCase(input: AnalysisCase) {
  const parsed = processPage(input.text);
  const pageModel = { ...parsed, documentId: "analysis-doc", pageNumber: input.pageNumber, requestKey: `${input.id}-${input.pageNumber}` };

  const norm = normalizeClinicalText({
    pageText: input.text,
    pageTitle: pageModel.pageSummary ?? undefined,
    pageNumber: input.pageNumber,
    headingLines: headingLinesFromText(input.text),
  });

  const domain = detectPageDomain(input.text);
  const validParagraphs = (pageModel.paragraphInsights ?? []).filter(isValidCoreParagraph);
  const teachingZone = findMainTeachingZone(validParagraphs);

  const allValidPage = adaptPageInsightModel({ ...pageModel, paragraphInsights: validParagraphs });
  const zonePage = adaptPageInsightModel({ ...pageModel, paragraphInsights: teachingZone });

  const conceptsAllValid = extractConceptBlocks(allValidPage);
  const conceptsZone = extractConceptBlocks(zonePage);

  const priorityScores = scoreDomainPriority(
    conceptsZone.flatMap((c, ci) => [
      { id: `${ci}:anchor`, text: c.anchorSentence },
      ...c.supportSentences.map((s, si) => ({ id: `${ci}:sup${si}`, text: s })),
    ]),
    domain,
  );

  const ultra = buildUltraPageView(pageModel);

  const stepModel = buildPageStepModel({
    pageKey: `analysis-doc:${input.pageNumber}`,
    pageTitle: `analysis-${input.id}`,
    pageSummary: pageModel.pageSummary ?? undefined,
    conceptBlocks: conceptsZone.map((c, idx) => ({
      id: c.id,
      title: c.title,
      pattern: c.anchorSentence,
      surgicalReason: c.supportSentences[0] ?? c.anchorSentence,
      trap: c.trapCandidates[0] ?? "",
      rule: c.supportSentences[1] ?? c.supportSentences[0] ?? c.anchorSentence,
      importance: ["VERY HIGH", "HIGH", "MEDIUM", "LOW"][idx] ?? "MEDIUM",
    })),
    highlightNeighborhoods: conceptsZone.map((c) => ({
      id: c.id,
      title: c.title,
      conceptRole: c.conceptRole,
      anchor: { id: `${c.id}:a`, text: c.anchorSentence },
      support: c.supportSentences.map((s, i) => ({ id: `${c.id}:s${i}`, text: s })),
      additional: [],
      trap: c.trapCandidates[0] ? { id: `${c.id}:t`, text: c.trapCandidates[0] } : null,
    })),
    supportNeighborhoods: conceptsZone.map((c) => ({
      id: c.id,
      title: c.title,
      anchor: c.anchorSentence,
      support: c.supportSentences,
      additional: [],
      trap: c.trapCandidates[0] ?? null,
    })),
  });

  const miniCandidates = stepModel.steps.flatMap((step) =>
    (["coreMeaning", "mechanism", "distinction", "application", "skimTrap"] as const).map((role) => ({
      id: `${step.id}:${role}`,
      stepId: step.id,
      stepOrder: step.order,
      role,
      text: step.miniTest[role] ?? "",
    })),
  ).filter((c) => Boolean(c.text));

  const miniSelected = selectMiniTestQuestions({ candidates: miniCandidates, maxQuestions: 5 });

  const compression = buildCompressionRules({
    pageKey: `analysis-doc:${input.pageNumber}`,
    pageTitle: `analysis-${input.id}`,
    pageSummary: pageModel.pageSummary ?? undefined,
    conceptBlocks: conceptsZone.map((c) => ({
      id: c.id,
      title: c.title,
      pattern: c.anchorSentence,
      reason: c.supportSentences[0] ?? c.anchorSentence,
      trap: c.trapCandidates[0] ?? "",
      rule: c.supportSentences[1] ?? c.supportSentences[0] ?? c.anchorSentence,
      importance: c.importance,
    })),
    supportNeighborhoods: conceptsZone.map((c) => ({
      id: c.id,
      title: c.title,
      anchor: c.anchorSentence,
      support: c.supportSentences,
      trap: c.trapCandidates[0] ?? null,
    })),
  });

  const leftNeighborhoods = buildHighlightNeighborhoods(conceptsAllValid);

  return {
    id: input.id,
    rawExtractedPageText: input.text,
    detectedDomain: domain,
    pageKind: norm.pageKind,
    pageClass: classifyPageContent(input.text),
    shouldRenderFullPanel: norm.shouldRenderFullPanel,
    detectedFormulaSignals: extractFormulaSignals(input.text),
    filteredParagraphList: validParagraphs.map((p) => ({ id: p.id, type: p.paragraphType, priorityScore: p.priorityScore, text: (p.cleanedText || p.rawText || "").slice(0, 220) })),
    mainTeachingZone: teachingZone.map((p) => ({ id: p.id, type: p.paragraphType, priorityScore: p.priorityScore, text: (p.cleanedText || p.rawText || "").slice(0, 220) })),
    conceptRoleClassification: conceptsZone.map((c) => ({ id: c.id, role: c.conceptRole, score: c.score, anchor: c.anchorSentence })),
    crossParagraphReasoningChain: (pageModel.paragraphInsights ?? []).flatMap((p) => (p.logicChains ?? []).map((chain) => ({ paragraphId: p.id, if: chain.if, then: chain.then, because: chain.because }))),
    priorityScoringResults: priorityScores,
    chosenCoreIdeaSource: ultra?._debug?.coreIdeaSource ?? null,
    chosenConceptBlockSource: ultra?.blocks.map((b) => ({ conceptId: b.conceptId, title: b.title, pattern: b.pattern })) ?? [],
    miniTestCandidateList: miniCandidates,
    miniTestSelectedResults: miniSelected,
    compressionCandidateList: { selected: compression.rules, rejected: compression.rejected },
    compressionSelectedResults: compression.rules,
    highlightNeighborhoodsGeneratedForLeftPanel: leftNeighborhoods,
    finalDataObjectConsumedByRightPanel: ultra,
    leftRightSourceComparison: {
      leftConceptIds: conceptsAllValid.map((c) => c.id),
      rightConceptIds: conceptsZone.map((c) => c.id),
      overlapConceptIds: conceptsAllValid.map((c) => c.id).filter((id) => conceptsZone.some((z) => z.id === id)),
    },
  };
}

describe("runtime failure analysis", () => {
  it("captures pipeline intermediates for biology and calculus", () => {
    const report = {
      generatedAt: new Date().toISOString(),
      cases: [analyzeCase(BIOLOGY_CASE), analyzeCase(CALCULUS_CASE)],
    };

    const outPath = path.join(process.cwd(), "test_reports", "runtime_failure_analysis.json");
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

    expect(report.cases).toHaveLength(2);
  });
});
