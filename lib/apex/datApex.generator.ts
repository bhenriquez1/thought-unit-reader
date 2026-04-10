// lib/apex/datApex.generator.ts
// Template-based question generator for all DAT sections.
// No API needed — uses PatternModule seed data to produce contextually rich questions.

import type { GeneratedQuestion } from "./datApexTypes";
import { DAT_PATTERN_MODULES, PatternModule, PatSubtype, getModulesBySection } from "./datApex.seed";
import type { ApexSection } from "./datApexTypes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GeneratorMode =
  | "pattern_drill"
  | "mixed_practice"
  | "trap_training"
  | "recognition"
  | "decision"
  | "speed";

export type GeneratorDifficulty = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type GeneratorProfile = {
  section: ApexSection;
  mode: GeneratorMode;
  difficulty: GeneratorDifficulty;
  datPlus?: boolean;
  targetPatternIds?: string[];
  trapDensity?: number; // 0–1
  patSubtype?: PatSubtype;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shuffleGen<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function genId(): string {
  return `gen_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getPatternPool(profile: GeneratorProfile): PatternModule[] {
  let pool = getModulesBySection(profile.section);

  if (profile.targetPatternIds?.length) {
    pool = pool.filter((m) => profile.targetPatternIds!.includes(m.id));
  }

  if (profile.section === "pat" && profile.patSubtype) {
    pool = pool.filter((m) => m.patSubtype === profile.patSubtype);
  }

  return pool.length ? pool : getModulesBySection(profile.section);
}

export function scaleDifficulty(
  base: number,
  opts: {
    accuracy?: number;
    fastResponse?: boolean;
    trapResistance?: number;
    datPlus?: boolean;
  },
): GeneratorDifficulty {
  let d = base;
  if ((opts.accuracy ?? 0) > 0.8) d += 2;
  if (opts.fastResponse) d += 1;
  if ((opts.trapResistance ?? 0) > 0.7) d += 1;
  if (opts.datPlus) d += 1;
  return Math.max(1, Math.min(10, Math.round(d))) as GeneratorDifficulty;
}

export function generateNextQuestion(profile: GeneratorProfile): GeneratedQuestion {
  const pool = getPatternPool(profile);
  const module = pool[Math.floor(Math.random() * pool.length)] ?? DAT_PATTERN_MODULES[0];

  switch (profile.section) {
    case "bio":
    case "gc":
    case "orgo":
      return generateScienceQuestion(module, profile, profile.section);
    case "qr":
      return generateQrQuestion(module, profile);
    case "rc":
      return generateRcQuestion(module, profile);
    case "pat":
      return generatePatQuestion(module, profile);
    default:
      return generateScienceQuestion(module, profile, profile.section);
  }
}

// ---------------------------------------------------------------------------
// Science generator (bio / gc / orgo)
// ---------------------------------------------------------------------------

function generateScienceQuestion(
  module: PatternModule,
  profile: GeneratorProfile,
  section: ApexSection,
): GeneratedQuestion {
  const { difficulty, datPlus = false, mode } = profile;
  const trap = (profile.trapDensity ?? 0) > 0.5;

  let question: string;
  let correct: string;
  let distractors: string[];

  if (mode === "trap_training") {
    question = `Which of the following is the most common error when this pattern appears: "${module.pattern.slice(0, 90)}"?`;
    correct = module.trap;
    distractors = [
      module.decisionRule.slice(0, 90),
      module.mechanism.split(".")[0],
      `Apply ${module.name} by the book without considering exceptions`,
    ];
  } else if (mode === "recognition") {
    question = `Which pattern is triggered by: "${module.pattern.slice(0, 90)}"?`;
    correct = module.name;
    const alt = getModulesBySection(section).find((m) => m.id !== module.id);
    distractors = [
      alt?.name ?? "Adjacent pattern from the same section",
      "No specific pattern — use background knowledge only",
      datPlus ? `${module.name} — reversed variant` : "Unrelated pattern from a different section",
    ];
  } else if (mode === "decision") {
    question = `Applying "${module.name}": which decision rule is correct?`;
    correct = module.decisionRule;
    distractors = [
      module.trap,
      module.mechanism.split(".")[0],
      datPlus
        ? `${module.decisionRule.split(";")[0]} — but only under boundary conditions`
        : `Skip ${module.name} and apply generic reasoning`,
    ];
  } else {
    // pattern_drill / mixed_practice / speed
    const stems = [
      `Which statement about "${module.name}" is most accurate?`,
      `A problem triggers: "${module.pattern.slice(0, 70)}". What is the correct action?`,
      `Which rule governs this scenario? "${module.pattern.slice(0, 70)}"`,
    ];
    question = stems[difficulty % stems.length];
    correct = module.decisionRule;
    distractors = datPlus
      ? [
          module.trap,
          `${module.decisionRule.split(";")[0]} — but reverse the constraint`,
          module.mechanism.split(";")[0] + " — skip the decision step",
        ]
      : [
          module.trap,
          `Use generic reasoning without the ${module.name} pattern`,
          `Apply an adjacent rule from the same category`,
        ];
  }

  return {
    id: genId(),
    section,
    patternId: module.id,
    difficulty,
    datPlus,
    trapType: mode === "trap_training" || trap ? module.trap : undefined,
    question,
    choices: shuffleGen([correct, ...distractors.slice(0, 3)]),
    answer: correct,
    explanation: `${module.name}: ${module.decisionRule} | Mechanism: ${module.mechanism} | Trap: ${module.trap}`,
    pdrm: { pattern: module.pattern, decisionRule: module.decisionRule, trap: module.trap },
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// QR generator
// ---------------------------------------------------------------------------

function generateQrQuestion(module: PatternModule, profile: GeneratorProfile): GeneratedQuestion {
  const { difficulty, datPlus = false, mode } = profile;

  const question =
    mode === "trap_training"
      ? `Which approach represents the most common mistake for: "${module.pattern.slice(0, 80)}"?`
      : mode === "recognition"
        ? `Which QR pattern applies to: "${module.pattern.slice(0, 80)}"?`
        : `${module.pattern}${datPlus ? " — consider the edge case" : ""}. Which approach is correct?`;

  const correct =
    mode === "trap_training" ? module.trap : mode === "recognition" ? module.name : module.decisionRule;

  const distractors = [
    mode === "trap_training" ? module.decisionRule : module.trap,
    `Skip variable definitions and compute directly`,
    datPlus ? `Apply ${module.name} but ignore unit constraints` : `Use estimation without setting up the model`,
  ];

  return {
    id: genId(),
    section: "qr",
    patternId: module.id,
    difficulty,
    datPlus,
    trapType: module.trap,
    question,
    choices: shuffleGen([correct, ...distractors.slice(0, 3)]),
    answer: correct,
    explanation: `${module.name}: ${module.decisionRule} | Trap: ${module.trap}`,
    pdrm: { pattern: module.pattern, decisionRule: module.decisionRule, trap: module.trap },
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// RC generator
// ---------------------------------------------------------------------------

function generateRcQuestion(module: PatternModule, profile: GeneratorProfile): GeneratedQuestion {
  const { difficulty, datPlus = false, mode } = profile;

  const question =
    mode === "trap_training"
      ? `Which of the following is the most common error on a "${module.name}" question?`
      : mode === "recognition"
        ? `A question asks: "${module.pattern.slice(0, 80)}". What type of RC question is this?`
        : `When a passage contains: "${module.pattern.slice(0, 80)}", which strategy applies?`;

  const correct =
    mode === "trap_training" ? module.trap : mode === "recognition" ? module.name : module.decisionRule;

  const distractors = [
    mode === "trap_training" ? module.decisionRule : module.trap,
    `Re-read the entire passage before answering`,
    datPlus ? `Infer beyond the text using outside knowledge` : `Answer based on general intuition`,
  ];

  return {
    id: genId(),
    section: "rc",
    patternId: module.id,
    difficulty,
    datPlus,
    trapType: module.trap,
    question,
    choices: shuffleGen([correct, ...distractors.slice(0, 3)]),
    answer: correct,
    explanation: `${module.name}: ${module.decisionRule} | Trap: ${module.trap}`,
    pdrm: { pattern: module.pattern, decisionRule: module.decisionRule, trap: module.trap },
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// PAT dispatcher + subtype generators
// ---------------------------------------------------------------------------

function generatePatQuestion(module: PatternModule, profile: GeneratorProfile): GeneratedQuestion {
  switch (module.patSubtype) {
    case "keyhole":        return generateKeyholeQuestion(module, profile);
    case "angle_ranking":  return generateAngleRankingQuestion(module, profile);
    case "cube_counting":  return generateCubeCountingQuestion(module, profile);
    case "paper_folding":  return generatePaperFoldingQuestion(module, profile);
    case "tfe":            return generateTfeQuestion(module, profile);
    default:               return generateKeyholeQuestion(module, profile);
  }
}

function generateKeyholeQuestion(module: PatternModule, profile: GeneratorProfile): GeneratedQuestion {
  const { difficulty, datPlus = false, mode } = profile;
  return {
    id: genId(),
    section: "pat",
    patternId: module.id,
    difficulty,
    datPlus,
    trapType: datPlus ? "near-fit silhouette distractor" : "dimension mismatch",
    question: datPlus
      ? "Which aperture allows the 3D object to pass through without rotation, given that one distractor has a near-identical silhouette?"
      : "Which aperture can the 3D object pass through without rotating out of plane?",
    choices: ["Aperture A", "Aperture B", "Aperture C", "Aperture D", "Aperture E"],
    answer: "Aperture C",
    explanation: "Eliminate options that violate the object's maximum width or depth first, then compare silhouette constraints at the aperture edges.",
    pdrm: { pattern: module.pattern, decisionRule: module.decisionRule, trap: module.trap },
    createdAt: new Date().toISOString(),
  };
}

function generateAngleRankingQuestion(module: PatternModule, profile: GeneratorProfile): GeneratedQuestion {
  const { difficulty, datPlus = false } = profile;
  return {
    id: genId(),
    section: "pat",
    patternId: module.id,
    difficulty,
    datPlus,
    trapType: datPlus ? "orientation illusion" : "line-length illusion",
    question: datPlus
      ? "Rank the four angles from smallest to largest. Note: arm lengths and orientations are intentionally misleading."
      : "Rank the four angles from smallest to largest.",
    choices: ["1-2-3-4", "2-1-4-3", "3-4-1-2", "4-3-2-1"],
    answer: "2-1-4-3",
    explanation: "Ignore arm length and tilt. Compare only the actual opening at each vertex. Extend arms mentally to equal length for fair comparison.",
    pdrm: { pattern: module.pattern, decisionRule: module.decisionRule, trap: module.trap },
    createdAt: new Date().toISOString(),
  };
}

function generateCubeCountingQuestion(module: PatternModule, profile: GeneratorProfile): GeneratedQuestion {
  const { difficulty, datPlus = false } = profile;
  return {
    id: genId(),
    section: "pat",
    patternId: module.id,
    difficulty,
    datPlus,
    trapType: datPlus ? "hidden support cube" : "double-counted face",
    question: datPlus
      ? "How many cubes in the irregular stack have exactly 3 exposed faces? (Hidden support cubes are included.)"
      : "How many cubes in the stack have exactly 3 exposed faces?",
    choices: ["3", "4", "5", "6", "7"],
    answer: "4",
    explanation: "Work layer by layer. For each cube, count faces not touching another cube or the floor. Hidden cubes below visible ones still count.",
    pdrm: { pattern: module.pattern, decisionRule: module.decisionRule, trap: module.trap },
    createdAt: new Date().toISOString(),
  };
}

function generatePaperFoldingQuestion(module: PatternModule, profile: GeneratorProfile): GeneratedQuestion {
  const { difficulty, datPlus = false } = profile;
  return {
    id: genId(),
    section: "pat",
    patternId: module.id,
    difficulty,
    datPlus,
    trapType: datPlus ? "double-mirror fold trap" : "missed fold reflection",
    question: datPlus
      ? "The paper is folded twice and punched. After unfolding both folds in reverse order, which hole pattern results?"
      : "After the paper is unfolded, which pattern of holes will appear?",
    choices: ["Pattern A", "Pattern B", "Pattern C", "Pattern D", "Pattern E"],
    answer: "Pattern D",
    explanation: "Reverse the folds one at a time. Mirror the punch across each fold line in reverse order. Each fold doubles the number of holes.",
    pdrm: { pattern: module.pattern, decisionRule: module.decisionRule, trap: module.trap },
    createdAt: new Date().toISOString(),
  };
}

function generateTfeQuestion(module: PatternModule, profile: GeneratorProfile): GeneratedQuestion {
  const { difficulty, datPlus = false } = profile;
  return {
    id: genId(),
    section: "pat",
    patternId: module.id,
    difficulty,
    datPlus,
    trapType: datPlus ? "hidden-edge mismatch" : "height alignment error",
    question: datPlus
      ? "Which 3D object matches all three views including hidden edges shown as dashed lines?"
      : "Which 3D object matches the given top, front, and end views?",
    choices: ["Object A", "Object B", "Object C", "Object D", "Object E"],
    answer: "Object B",
    explanation: "Reconcile all three views simultaneously. An edge present in top view must be accounted for in front and end views. One inconsistency eliminates the choice.",
    pdrm: { pattern: module.pattern, decisionRule: module.decisionRule, trap: module.trap },
    createdAt: new Date().toISOString(),
  };
}
