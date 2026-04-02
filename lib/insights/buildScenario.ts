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
      primaryText: buildCaseLine(scenarioBase),
      secondaryText: "Read the case first; do not jump to action.",
    },
    {
      label: role === "expert" ? "Clue" : "Key clue",
      primaryText: buildClueLine(scenarioBase),
      secondaryText: scenarioBase?.interpretation || "Interpret this clue before deciding.",
    },
    {
      label: role === "expert" ? "Rule" : role === "operator" ? "Next move" : "What to do",
      primaryText: buildActionLine(scenarioBase),
      secondaryText: scenarioBase?.implication,
    },
    {
      label: role === "expert" ? "Pitfall" : "Wrong move",
      primaryText: buildTrapLine(scenarioBase),
      secondaryText: undefined,
    },
  ];

  const stepCount = getScenarioStepCount(depth);
  const evidenceText = scenarioBase?.evidence?.[0] || scenarioBase?.condition || pageModel.pageSummary;
  const evidenceAnchor = {
    id: `${scenarioBase?.id || "apply"}-ev`,
    paragraphIndex: 0,
    text: evidenceText,
  };

  const steps: GuidedReadStep[] = stepTemplates.slice(0, stepCount).map((entry, index) => ({
    id: `apply-${index + 1}`,
    stepNumber: index + 1,
    label: entry.label,
    primaryText: clean(entry.primaryText),
    secondaryText: entry.secondaryText ? clean(entry.secondaryText) : undefined,
    mode: "apply",
    role,
    confidence: scenarioBase?.confidence ?? 0.72,
    evidence: [evidenceAnchor],
  }));

  return {
    pagePurpose: buildScenarioPurpose(pageModel, role),
    steps,
    supportTitle: "Scenario checkpoints",
    supportBullets: buildScenarioBullets(sequences, depth),
  };
}

function selectScenarioBase(sequences: DecisionPath[]): DecisionPath | undefined {
  return sequences.find((entry) => entry.nextMove || entry.trap) || sequences[0];
}

function buildCaseLine(sequence?: DecisionPath): string {
  return sequence?.condition || "A practical scenario appears on this page.";
}

function buildClueLine(sequence?: DecisionPath): string {
  return sequence?.interpretation || sequence?.implication || "Find the clue that changes the meaning.";
}

function buildActionLine(sequence?: DecisionPath): string {
  return sequence?.nextMove || sequence?.implication || "Choose the next move from the clue.";
}

function buildTrapLine(sequence?: DecisionPath): string {
  return sequence?.trap || "Avoid the likely wrong move for this scenario.";
}

function buildScenarioPurpose(pageModel: PageInsightModel, role: GuidedRole): string {
  const base = pageModel.pageSummary || "Practice turning clues into action.";
  if (role === "expert") return `Apply/Test scenario: ${base}`;
  if (role === "operator") return `Operational scenario: ${base}`;
  return `Case-based practice: ${base}`;
}

function buildScenarioBullets(sequences: DecisionPath[], depth: GuidedDepth): string[] {
  const max = depth === "quick" ? 2 : depth === "standard" ? 3 : 4;
  const bullets = sequences.flatMap((entry) => [entry.condition, entry.nextMove, entry.trap].filter(Boolean) as string[]);
  return dedupe(bullets).slice(0, max);
}

function getScenarioStepCount(depth: GuidedDepth): number {
  return depth === "quick" ? 2 : depth === "standard" ? 3 : 4;
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
