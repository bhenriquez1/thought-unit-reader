// lib/examEngine/legacyAdapter.ts
// Bridges the universal Exam Engine (EngineQuestion/BuiltExam) onto the
// pre-existing DATQuestion/GeneratedExam shapes that app/apex/proctor/page.tsx
// and app/apex/results/page.tsx already consume from localStorage. This lets
// the proctor/results UI keep working unmodified while only the generation
// source (app/apex/generator/page.tsx) switches from the deleted static
// question bank to AI-generated, book-grounded questions.

import { DAT_SECTIONS } from "@/types/apex-exam";
import type { DATQuestion, ExamConfiguration } from "@/types/apex-exam";
import type { GeneratedExam } from "@/lib/apex/examGenerator";
import type { BuiltExam } from "@/lib/examEngine/examBuilder";
import type { DifficultyLevel, EngineQuestion, ExamProfile } from "@/lib/examEngine/types";

const ANSWER_LETTERS = ["A", "B", "C", "D", "E"] as const;

export function difficultyToLegacy(d: DifficultyLevel): "easy" | "medium" | "hard" {
  if (d === "foundation") return "easy";
  if (d === "mastery") return "hard";
  return "medium"; // simulation and advanced both map to medium
}

export function legacyToDifficulty(d: "easy" | "medium" | "hard"): DifficultyLevel {
  return d === "easy" ? "foundation" : d === "hard" ? "mastery" : "simulation";
}

export function engineQuestionToDATQuestion(q: EngineQuestion): DATQuestion {
  const options: DATQuestion["options"] = { A: "", B: "", C: "", D: "" };
  q.choices.forEach((choice, i) => {
    const letter = ANSWER_LETTERS[i];
    if (letter) options[letter] = choice;
  });

  return {
    id: q.id,
    sectionId: q.section,
    topic: q.topic,
    subtopic: q.subtopic,
    difficulty: difficultyToLegacy(q.difficulty),
    questionType: "multiple-choice",
    stem: q.stem,
    options,
    correctAnswer: ANSWER_LETTERS[q.correctIndex] ?? "A",
    explanation: q.whyCorrect,
    keyTerms: [],
    relatedConcepts: [],
    estimatedTime: 90,
    tags: q.trapType ? [q.trapType] : [],
    source: "AI-generated",
    lastUpdated: q.createdAt,
    whyWrong: q.whyWrong,
    trapType: q.trapType,
    engineQuestionType: q.questionType,
    sourceBookId: q.sourceBookId,
    sourcePageNumber: q.sourcePageNumber,
    sourceThoughtUnitIds: q.sourceThoughtUnitIds,
    sourceKnowledgeNodeIds: q.sourceKnowledgeNodeIds,
    sourceDocumentId: q.sourceDocumentId,
    examProfileId: q.examProfileId,
    misconceptionTested: q.misconceptionTested,
  };
}

/** Converts an AI-built exam into the legacy GeneratedExam shape the proctor
 *  and results pages already render — the only thing that's changed is
 *  where the questions came from.
 *
 *  P1 fix — per-section time limits used to come ONLY from DAT_SECTIONS
 *  (a DAT-specific lookup table), falling back to a hardcoded 30 minutes
 *  for any section id DAT_SECTIONS doesn't know about — which is every
 *  section of every non-DAT profile (e.g. Custom Exam's single "general"
 *  section). The proctor's live countdown timer reads exactly this
 *  per-section value (app/apex/proctor/page.tsx's groupBySections), not
 *  config.totalTimeLimit, so a 60-minute Custom Exam silently ran out
 *  after 30. `profile` (when given) is now checked FIRST via its own
 *  ExamSectionConfig.defaultTimeLimitMinutes — the source of truth for
 *  any profile's own sections — before falling back to DAT_SECTIONS
 *  (still correct for the DAT profile, whose questions carry DAT's own
 *  section ids) and finally the 30-minute constant as a last resort. */
export function builtExamToGeneratedExam(
  built: BuiltExam,
  totalTimeLimitMinutes: number,
  practiceMode?: 'practice' | 'practice-exam' | 'full-dat',
  profile?: ExamProfile,
): GeneratedExam {
  const questions = built.questions.map(engineQuestionToDATQuestion);

  const sectionIds = Array.from(new Set(questions.map((q) => q.sectionId)));
  const sections: ExamConfiguration["sections"] = sectionIds.map((sectionId) => {
    const profileSection = profile?.sections.find((s) => s.id === sectionId);
    const datSection = DAT_SECTIONS.find((s) => s.id === sectionId);
    return {
      sectionId,
      enabled: true,
      questionCount: questions.filter((q) => q.sectionId === sectionId).length,
      timeLimit: profileSection?.defaultTimeLimitMinutes ?? datSection?.timeLimit ?? 30,
    };
  });

  const config: ExamConfiguration = {
    id: built.id,
    name: `${built.difficulty[0].toUpperCase()}${built.difficulty.slice(1)} Exam`,
    description: `AI-generated ${built.difficulty} exam grounded in your notes — ${questions.length} questions`,
    sections,
    totalTimeLimit: totalTimeLimitMinutes,
    allowPause: practiceMode === 'practice' || built.difficulty === "foundation",
    showTimer: practiceMode !== 'practice',
    showProgress: true,
    randomizeQuestions: false,
    randomizeOptions: false,
    immediateReview: practiceMode === 'practice' || built.difficulty === "foundation",
    showExplanations: true,
    enableTUExplanations: true,
    strictMode: practiceMode === 'full-dat',
    autoSubmit: practiceMode === 'full-dat',
    warningThresholds: { timeRemaining: 5, questionsRemaining: 5 },
  };

  const difficultyDistribution = { easy: 0, medium: 0, hard: 0 };
  const topicCoverage: Record<string, number> = {};
  for (const q of questions) {
    difficultyDistribution[q.difficulty] += 1;
    topicCoverage[q.topic] = (topicCoverage[q.topic] ?? 0) + 1;
  }

  return {
    id: built.id,
    config,
    questions,
    metadata: {
      generatedAt: built.metadata.generatedAt,
      totalQuestions: questions.length,
      estimatedTime: totalTimeLimitMinutes,
      difficultyDistribution,
      topicCoverage,
      sectionBreakdown: sections.map((s) => ({
        sectionId: s.sectionId,
        questionCount: s.questionCount,
        timeLimit: s.timeLimit,
      })),
    },
  };
}
