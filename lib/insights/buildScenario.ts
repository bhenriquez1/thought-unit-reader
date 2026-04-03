import { toExpertSentence, toGeneralSentence, toOperatorSentence } from "@/lib/insights/sentenceCleanup";
import { sanitizePrimarySentence } from "@/lib/insights/isRenderableSentence";
import type {
  DecisionPath,
  GuidedDepth,
  GuidedReadStep,
  GuidedReadView,
  GuidedRole,
  PageInsightModel,
} from "@/lib/insights/types";

type BuildScenarioArgs = {
  pageModel: PageInsightModel;
  role: GuidedRole;
  depth: GuidedDepth;
};

export function buildScenario({ pageModel, role, depth }: BuildScenarioArgs): GuidedReadView {
  const sequences = pageModel.decisionPaths || [];
  const scenarioBase = selectScenarioBase(sequences);
  const stepTemplates = [
    { label: role === "expert" ? "Case" : "Scenario", primaryText: buildCaseLine(scenarioBase), secondaryText: "Read the case first; do not jump to action." },
    { label: role === "expert" ? "Clue" : "Key clue", primaryText: buildClueLine(scenarioBase), secondaryText: scenarioBase?.interpretation || "Interpret this clue before deciding." },
    { label: role === "expert" ? "Rule" : role === "operator" ? "Next move" : "What to do", primaryText: buildActionLine(scenarioBase), secondaryText: scenarioBase?.implication },
    { label: role === "expert" ? "Pitfall" : "Wrong move", primaryText: buildTrapLine(scenarioBase), secondaryText: undefined },
  ];

  const steps: GuidedReadStep[] = stepTemplates.slice(0, getScenarioStepCount(depth)).map((entry, index) => ({
    id: `apply-${index + 1}`,
    stepNumber: index + 1,
    label: entry.label,
    primaryText: sanitizePrimarySentence(roleSentence(role, entry.primaryText), "No grounded scenario sentence was extracted from this page."),
    secondaryText: entry.secondaryText && depth !== "quick" ? sanitizePrimarySentence(roleSentence(role, entry.secondaryText), "") : undefined,
    mode: "apply",
    role,
    confidence: scenarioBase?.confidence ?? 0.72,
    evidence: buildEvidenceAnchors(scenarioBase, depth, role),
  }));

  return {
    pagePurpose: roleSentence(role, buildScenarioPurpose(pageModel, role)),
    steps,
    supportTitle: "Scenario checkpoints",
    supportBullets: buildScenarioBullets(sequences, depth).map((line) => roleSentence(role, line)),
  };
}

function buildEvidenceAnchors(sequence: DecisionPath | undefined, depth: GuidedDepth, role: GuidedRole) {
  const source = sequence?.evidence?.length ? sequence.evidence : [sequence?.condition || "No evidence sentence extracted from the page."];
  const max = depth === "quick" ? 1 : depth === "standard" ? 2 : 3;
  return source.slice(0, max).map((text, index) => ({
    id: `${sequence?.id || "apply"}-ev-${index}`,
    paragraphIndex: 0,
    text: roleSentence(role, text),
  }));
}

function selectScenarioBase(sequences: DecisionPath[]): DecisionPath | undefined {
  return sequences.find((entry) => entry.nextMove || entry.trap) || sequences[0];
}

function buildCaseLine(sequence?: DecisionPath): string {
  return sequence?.condition || "A practical scenario appears on this page";
}

function buildClueLine(sequence?: DecisionPath): string {
  return sequence?.interpretation || sequence?.implication || "Find the clue that changes the meaning";
}

function buildActionLine(sequence?: DecisionPath): string {
  return sequence?.nextMove || sequence?.implication || "Choose the next move from the clue";
}

function buildTrapLine(sequence?: DecisionPath): string {
  return sequence?.trap || "Avoid the likely wrong move for this scenario";
}

function buildScenarioPurpose(pageModel: PageInsightModel, role: GuidedRole): string {
  const base = pageModel.pageSummary || "Practice turning clues into action";
  if (role === "expert") return `Apply/test scenario: ${base}`;
  if (role === "operator") return `Operational scenario: ${base}`;
  return `Case-based practice: ${base}`;
}

function buildScenarioBullets(sequences: DecisionPath[], depth: GuidedDepth): string[] {
  const max = depth === "quick" ? 1 : depth === "standard" ? 3 : 4;
  const seen = new Set<string>();
  const bullets: string[] = [];
  for (const line of sequences.flatMap((entry) => [entry.condition, entry.nextMove, entry.trap].filter(Boolean) as string[])) {
    const key = line.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    bullets.push(line);
    if (bullets.length >= max) break;
  }
  return bullets;
}

function getScenarioStepCount(depth: GuidedDepth): number {
  return depth === "quick" ? 2 : depth === "standard" ? 3 : 4;
}

function roleSentence(role: GuidedRole, text: string): string {
  if (role === "expert") return toExpertSentence(text);
  if (role === "operator") return toOperatorSentence(text);
  return toGeneralSentence(text);
}
