import { toCompleteSentence, toExpertSentence, toGeneralSentence, toOperatorSentence } from "@/lib/insights/sentenceCleanup";
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
    {
      label: role === "expert" ? "Case" : "Scenario",
      primaryText: styleByRole(role, buildCaseLine(scenarioBase), buildCaseLine(scenarioBase), buildCaseLine(scenarioBase)),
      secondaryText: depth === "deep" ? toCompleteSentence("Read the case first; do not jump to action") : undefined,
    },
    {
      label: role === "expert" ? "Clue" : "Key clue",
      primaryText: styleByRole(role, buildClueLine(scenarioBase), buildClueLine(scenarioBase), buildClueLine(scenarioBase)),
      secondaryText: depth !== "quick" ? toCompleteSentence(scenarioBase?.interpretation || "Interpret this clue before deciding") : undefined,
    },
    {
      label: role === "expert" ? "Rule" : role === "operator" ? "Next move" : "What to do",
      primaryText: styleByRole(role, buildActionLine(scenarioBase), buildActionLine(scenarioBase), buildActionLine(scenarioBase)),
      secondaryText: depth === "deep" ? toCompleteSentence(scenarioBase?.implication || "This drives the next decision") : undefined,
    },
    {
      label: role === "expert" ? "Pitfall" : "Wrong move",
      primaryText: styleByRole(role, buildTrapLine(scenarioBase), buildTrapLine(scenarioBase), buildTrapLine(scenarioBase)),
      secondaryText: undefined,
    },
  ];

  const stepCount = getScenarioStepCount(depth);
  const evidenceLimit = depth === "quick" ? 1 : depth === "standard" ? 2 : 3;
  const evidenceTextPool = (scenarioBase?.evidence || []).slice(0, evidenceLimit);
  if (!evidenceTextPool.length) evidenceTextPool.push(scenarioBase?.condition || pageModel.pageSummary);

  const steps: GuidedReadStep[] = stepTemplates.slice(0, stepCount).map((entry, index) => ({
    id: `apply-${index + 1}`,
    stepNumber: index + 1,
    label: entry.label,
    primaryText: entry.primaryText,
    secondaryText: entry.secondaryText,
    mode: "apply",
    role,
    confidence: scenarioBase?.confidence ?? 0.72,
    evidence: evidenceTextPool.map((text, evidenceIndex) => ({
      id: `${scenarioBase?.id || "apply"}-ev-${evidenceIndex}`,
      paragraphIndex: index,
      text: toCompleteSentence(text),
    })),
  }));

  return {
    pagePurpose: buildScenarioPurpose(pageModel, role),
    steps,
    supportTitle: "Scenario checkpoints",
    supportBullets: buildScenarioBullets(sequences, depth),
  };
}

function styleByRole(role: GuidedRole, general: string, operator: string, expert: string): string {
  if (role === "expert") return toExpertSentence(expert);
  if (role === "operator") return toOperatorSentence(operator);
  return toGeneralSentence(general);
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
  if (role === "expert") return toCompleteSentence(`Apply/Test scenario: ${base}`);
  if (role === "operator") return toCompleteSentence(`Operational scenario: ${base}`);
  return toCompleteSentence(`Case-based practice: ${base}`);
}

function buildScenarioBullets(sequences: DecisionPath[], depth: GuidedDepth): string[] {
  const max = depth === "quick" ? 1 : depth === "standard" ? 3 : 5;
  const bullets = sequences.flatMap((entry) => [entry.condition, entry.nextMove, entry.trap].filter(Boolean) as string[]);
  return dedupe(bullets).slice(0, max);
}

function getScenarioStepCount(depth: GuidedDepth): number {
  return depth === "quick" ? 2 : depth === "standard" ? 3 : 4;
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items
    .map((item) => toCompleteSentence(item))
    .filter((item) => {
      const key = item.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
