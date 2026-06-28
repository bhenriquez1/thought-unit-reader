// lib/examEngine/profiles/datProfile.ts
// DAT as the first ExamProfile — maps the existing DAT_SECTIONS (the 4
// official DAT sections from types/apex-exam.ts) and DAT_PATTERN_MODULES
// (the 6-way bio/gc/orgo/pat/rc/qr pattern taxonomy from datApex.seed.ts)
// into one universal ExamProfile. Both existing taxonomies stay as-is;
// this file is the reconciliation layer between them.

import { DAT_SECTIONS } from "@/types/apex-exam";
import { DAT_PATTERN_MODULES } from "@/lib/apex/datApex.seed";
import type { ApexSection } from "@/lib/apex/datApexTypes";
import type { ExamProfile, ExamSectionConfig, TopicBlueprintEntry } from "@/lib/examEngine/types";

export const DAT_EXAM_PROFILE_ID = "dat";

/** Pattern-module sections (finer-grained science breakdown) collapse into
 *  the 4 official DAT score sections. */
const APEX_SECTION_TO_DAT_SECTION_ID: Record<ApexSection, string> = {
  bio: "survey-natural-sciences",
  gc: "survey-natural-sciences",
  orgo: "survey-natural-sciences",
  pat: "perceptual-ability",
  rc: "reading-comprehension",
  qr: "quantitative-reasoning",
};

const sections: ExamSectionConfig[] = DAT_SECTIONS.map((s) => ({
  id: s.id,
  name: s.name,
  shortName: s.shortName,
  defaultQuestionCount: s.questionCount,
  defaultTimeLimitMinutes: s.timeLimit,
  topics: s.topics,
}));

function buildTopicBlueprint(): TopicBlueprintEntry[] {
  const countByDatSection = new Map<string, number>();
  for (const m of DAT_PATTERN_MODULES) {
    const datSectionId = APEX_SECTION_TO_DAT_SECTION_ID[m.section];
    countByDatSection.set(datSectionId, (countByDatSection.get(datSectionId) ?? 0) + 1);
  }

  return DAT_PATTERN_MODULES.map((m) => {
    const datSectionId = APEX_SECTION_TO_DAT_SECTION_ID[m.section];
    const peers = countByDatSection.get(datSectionId) ?? 1;
    return {
      topic: m.name,
      section: datSectionId,
      weight: 1 / peers,
      skillsTested: [m.decisionRule],
      commonMisconceptions: [m.trap],
    };
  });
}

export const DAT_EXAM_PROFILE: ExamProfile = {
  id: DAT_EXAM_PROFILE_ID,
  examName: "Dental Admission Test (DAT)",
  sections,
  questionTypes: ["recognition", "decision", "application", "trap_training", "recall"],
  difficultyLevels: ["foundation", "simulation", "mastery"],
  timingRules: {
    totalTimeLimitMinutes: DAT_SECTIONS.reduce((sum, s) => sum + s.timeLimit, 0),
    perSectionOverrides: Object.fromEntries(DAT_SECTIONS.map((s) => [s.id, s.timeLimit])),
    warningThresholdMinutes: 5,
  },
  scoringRules: {
    pointsPerQuestion: 1,
    penalizeGuessing: false,
    scaledScoreRange: { min: 1, max: 30 },
  },
  topicBlueprint: buildTopicBlueprint(),
  weaknessAnalytics: {
    minAttemptsForSignal: 3,
    weakAccuracyThreshold: 60,
    strongAccuracyThreshold: 85,
  },
};
