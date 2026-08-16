// lib/examEngine/profileGeneration.ts
// Seam between the Exam Forge dashboard and its question source. Today this
// still delegates to the legacy static question bank (lib/apex/examGenerator.ts)
// with IDENTICAL behavior to before — the point of this file is that the
// dashboard no longer imports that concrete legacy class directly. A future
// PR can swap this wrapper's internals to prefer profile/canonical-unit-
// grounded generation (examBuilder.ts) without touching the dashboard again.

import { ExamGenerator, examGeneratorUtils, type GeneratedExam, type GeneratorOptions } from "@/lib/apex/examGenerator";
import type { UserPattern } from "@/lib/apex/datApexTypes";

/** Same behavior as `ExamGenerator.fromQuestionBank().generateExam(opts)` today —
 *  a pure indirection seam, not a new generation path. */
export async function generateLegacyProfileExam(options: GeneratorOptions): Promise<GeneratedExam> {
  const generator = await ExamGenerator.fromQuestionBank();
  return generator.generateExam(options);
}

export async function generateWeakTopicsPracticeExam(
  patterns: UserPattern[],
  targetPatternIds: string[],
  questionCount: number,
  difficulty: GeneratorOptions["difficulty"],
): Promise<GeneratedExam> {
  const baseOpts = examGeneratorUtils.createWeakTopicsPractice(patterns, targetPatternIds, questionCount);
  return generateLegacyProfileExam({ ...baseOpts, difficulty });
}

export async function generateFullSimulationExam(): Promise<GeneratedExam> {
  return generateLegacyProfileExam(examGeneratorUtils.createFullDAT());
}
