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

  const stepPool: Array<{ label: string; primaryText: string; secondaryText?: string }> = [
    {
      label: role === "expert" ? "Case" : "Scenario",
      primaryText: buildCaseLine(scenarioBase, role),
      secondaryText: role === "general" ? "Start by recognizing the pattern before deciding." : undefined,
    },
    {
      label: role === "expert" ? "Clue" : "Key clue",
      primaryText: buildClueLine(scenarioBase, role),
      secondaryText: scenarioBase?.interpretation,
    },
    {
      label: role === "expert" ? "Rule" : role === "operator" ? "Next move" : "What to do",
      primaryText: buildActionLine(scenarioBase, role),
      secondaryText: scenarioBase?.nextMove,
    },
    {
      label: role === "expert" ? "Pitfall" : "Wrong move",
      primaryText: buildTrapLine(scenarioBase, role),
      secondaryText: undefined,
    },
  ];

  const stepCount = getScenarioStepCount(depth);
  const evidenceText = scenarioBase?.evidence?.[0] || scenarioBase?.interpretation || pageModel.pageSummary;
  const evidenceAnchor = {
    id: `${scenarioBase?.id || "apply"}-ev`,
    paragraphIndex: 0,
    text: evidenceText,
  };

  const steps: GuidedReadStep[] = stepPool
    .slice(0, stepCount)
    .filter((entry) => Boolean(entry.primaryText))
    .map((entry, index) => ({
      id: `apply-${index + 1}`,
      stepNumber: index + 1,
      label: entry.label,
      primaryText: clean(entry.primaryText),
      secondaryText: entry.secondaryText ? clean(entry.secondaryText) : undefined,
      mode: "apply",
      role,
      confidence: scenarioBase?.confidence ?? 0.7,
      evidence: [evidenceAnchor],
    }));

  return {
    pagePurpose: buildScenarioPurpose(pageModel, role),
    steps,
    supportTitle: "Fast rule",
    supportBullets: buildScenarioBullets(sequences, depth),
  };
}

function selectScenarioBase(sequences: DecisionPath[]): DecisionPath | undefined {
  return sequences.find((entry) => entry.nextMove || entry.trap) || sequences[0];
}

function buildCaseLine(sequence: DecisionPath | undefined, role: GuidedRole): string {
  if (!sequence) return "A practical scenario on this page requires interpretation before action.";
  if (role === "expert") return sequence.condition;
  if (role === "operator") return sequence.condition;
  return sequence.condition;
}

function buildClueLine(sequence: DecisionPath | undefined, role: GuidedRole): string {
  if (!sequence) return "Find the clue that changes what this page means.";
  if (role === "expert") return sequence.interpretation || sequence.implication;
  if (role === "operator") return sequence.interpretation || sequence.implication;
  return sequence.interpretation || sequence.implication;
}

function buildActionLine(sequence: DecisionPath | undefined, role: GuidedRole): string {
  if (!sequence) return "Choose the next step from the clue, not from first impression.";
  if (role === "expert") return sequence.nextMove || sequence.implication;
  if (role === "operator") return sequence.nextMove || sequence.implication;
  return sequence.nextMove || sequence.implication;
}

function buildTrapLine(sequence: DecisionPath | undefined, role: GuidedRole): string {
  if (!sequence) return "Avoid confusing an initial clue with a final conclusion.";
  if (role === "expert") return sequence.trap || "Avoid the common incorrect inference.";
  if (role === "operator") return sequence.trap || "Do not make the common wrong move.";
  return sequence.trap || "Do not make the likely mistake here.";
}

function buildScenarioPurpose(pageModel: PageInsightModel, role: GuidedRole): string {
  const base = pageModel.pageSummary || "Use this page as a case-reading guide.";
  if (role === "expert") return `Apply/Test: ${base}`;
  if (role === "operator") return `Run this like a real scenario: ${base}`;
  return `Practice with this page as a scenario: ${base}`;
}

function buildScenarioBullets(sequences: DecisionPath[], depth: GuidedDepth): string[] {
  const max = depth === "quick" ? 1 : depth === "standard" ? 2 : 3;
  const bullets = sequences.flatMap((entry) => [entry.nextMove, entry.trap].filter(Boolean) as string[]);
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
